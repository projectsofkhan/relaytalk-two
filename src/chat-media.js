const IMGBB_API_KEY = "82e49b432e2ee14921f7d0cd81ba5551";

const CLOUDINARY_CLOUD_NAME = "rsbivvqy";
const CLOUDINARY_UPLOAD_PRESET = "relaytalk_voice";

export async function uploadImageToImgBB(file) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("Please select a valid image.");
  }

  if (file.size > 20 * 1024 * 1024) {
    throw new Error("Image must be smaller than 20 MB.");
  }

  const formData = new FormData();
  formData.append("key", IMGBB_API_KEY);
  formData.append("image", file);
  formData.append(
    "name",
    `relaytalk_${Date.now()}_${file.name.replace(/\s+/g, "_")}`
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  let response;

  try {
    response = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: formData,
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Image upload failed (${response.status}).`);
  }

  const result = await response.json();

  if (!result.success || !result.data?.url) {
    throw new Error(result.error?.message || "Image upload failed.");
  }

  return {
    imageUrl: result.data.url,
    thumbnailUrl: result.data.thumb?.url || result.data.url,
  };
}

export async function uploadAudioToCloudinary(blob) {
  if (!blob || !blob.size) {
    throw new Error("No voice recording found.");
  }

  const extension = blob.type.includes("ogg")
    ? "ogg"
    : blob.type.includes("mp4")
      ? "m4a"
      : blob.type.includes("aac")
        ? "aac"
        : "webm";

  const file = new File(
    [blob],
    `relaytalk_voice_${Date.now()}.${extension}`,
    { type: blob.type || "audio/webm" }
  );

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  let response;

  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`,
      {
        method: "POST",
        body: formData,
        signal: controller.signal,
      }
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Voice upload failed (${response.status}).`);
  }

  const result = await response.json();

  if (!result.secure_url) {
    throw new Error("Cloudinary did not return an audio URL.");
  }

  return {
    url: result.secure_url,
    publicId: result.public_id,
    bytes: result.bytes,
  };
}
