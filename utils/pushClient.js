// utils/pushClient.js
// Client-side Web Push subscription manager.
// Registers the service worker itself (no separate sw-manager required).

import { initializeSupabase } from './supabase.js'

// ⚠️ Your VAPID public key
const VAPID_PUBLIC_KEY = 'BJvYkb3poqpv8xqDhYxhgzTomReEe4fsxiEdJsb8dwN-j7GNPmfcBXLcOvmIJOcvcAAtvzNfy1rEb_7mY63281w'

let supabase = null
let currentUser = null
let swRegistration = null
let swRegisterPromise = null

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
}

async function ensureServiceWorker() {
    if (!('serviceWorker' in navigator)) return null
    if (swRegistration) return swRegistration
    if (swRegisterPromise) return swRegisterPromise

    swRegisterPromise = (async () => {
        try {
            const swPath = '/service-worker.js'
            const existing = await navigator.serviceWorker.getRegistration(swPath)
            if (existing) {
                swRegistration = existing
                return existing
            }
            const reg = await navigator.serviceWorker.register(swPath, { scope: '/' })
            swRegistration = reg
            return reg
        } catch (err) {
            console.error('📬 [push] SW registration failed:', err.message)
            return null
        }
    })()

    return swRegisterPromise
}

async function waitForActiveWorker(reg) {
    if (reg.active) return reg.active

    return new Promise((resolve) => {
        const worker = reg.installing || reg.waiting
        if (!worker) {
            const timeout = setTimeout(() => resolve(reg.active), 5000)
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                clearTimeout(timeout)
                resolve(reg.active)
            }, { once: true })
            return
        }
        if (worker.state === 'activated') {
            resolve(worker)
            return
        }
        worker.addEventListener('statechange', () => {
            if (worker.state === 'activated') resolve(worker)
        })
        setTimeout(() => resolve(reg.active), 8000)
    })
}

async function getReadyRegistration() {
    const reg = await ensureServiceWorker()
    if (!reg) return null
    if (!reg.active) {
        await waitForActiveWorker(reg)
    }
    return reg
}

export async function initPushClient() {
    console.log('📬 [push] Initializing...')

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return { success: false, reason: 'unsupported' }
    }

    await ensureServiceWorker()

    try {
        supabase = await initializeSupabase()
        if (!supabase?.auth) return { success: false, reason: 'no supabase' }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
            return { success: false, reason: 'no session' }
        }

        currentUser = session.user

        if (Notification.permission === 'granted') {
            await subscribeCurrentDevice()
        }

        return { success: true }
    } catch (error) {
        console.error('📬 [push] Init error:', error)
        return { success: false, reason: error.message }
    }
}

export async function requestPushPermission() {
    if (!('Notification' in window)) {
        return { success: false, reason: 'unsupported' }
    }

    await ensureServiceWorker()
    const perm = await Notification.requestPermission()

    if (perm !== 'granted') {
        return { success: false, reason: 'denied' }
    }

    return await subscribeCurrentDevice()
}

async function subscribeCurrentDevice() {
    try {
        const reg = await getReadyRegistration()
        if (!reg) return { success: false, reason: 'no service worker' }

        let subscription = await reg.pushManager.getSubscription()

        if (!subscription) {
            try {
                subscription = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                })
            } catch (subErr) {
                let reason = subErr.name || 'unknown'
                if (subErr.name === 'NotAllowedError') reason = 'permission denied'
                if (subErr.name === 'AbortError') reason = 'service worker not ready'
                if (subErr.name === 'InvalidStateError') reason = 'browser state invalid'
                return { success: false, reason }
            }
        }

        await saveSubscriptionToDb(subscription)
        return { success: true }
    } catch (error) {
        return { success: false, reason: error.message }
    }
}

async function saveSubscriptionToDb(subscription) {
    if (!supabase || !currentUser) return

    const json = subscription.toJSON()
    const payload = {
        user_id: currentUser.id,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString()
    }

    if (!payload.endpoint || !payload.p256dh || !payload.auth) {
        return
    }

    await supabase.from('push_subscriptions').upsert(payload, { onConflict: 'endpoint' })
}

export async function unsubscribePush() {
    try {
        const reg = await ensureServiceWorker()
        if (!reg) return
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
            const endpoint = sub.endpoint
            await sub.unsubscribe()
            if (supabase) {
                await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
            }
        }
    } catch (e) {
        console.warn('📬 [push] Unsubscribe error:', e)
    }
}

if (typeof window !== 'undefined') {
    window.relaytalkPush = {
        init: initPushClient,
        request: requestPushPermission,
        unsubscribe: unsubscribePush
    }
}