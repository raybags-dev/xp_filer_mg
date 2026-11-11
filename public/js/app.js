const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const selectionArea = document.getElementById("selectionArea");
const selectionCount = document.getElementById("selectionCount");
const imageList = document.getElementById("imageList");
const uploadButton = document.getElementById("uploadButton");
const clearButton = document.getElementById("clearButton");

const progressSection = document.getElementById("progressSection");
const progressLabel = document.getElementById("progressLabel");
const progressValue = document.getElementById("progressValue");
const progressTrack = document.getElementById("progressTrack");
const statusElement = document.getElementById("status");

const MIME_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

let files = [];
let uploading = false;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getContentType(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  const expectedType = MIME_TYPES[extension];

  if (!expectedType) {
    throw new Error(`Unsupported file format: ${file.name}`);
  }

  // Some browsers report an empty MIME type.
  // Use the extension to determine the expected content type.
  if (file.type && file.type !== expectedType) {
    throw new Error(`File type does not match its extension: ${file.name}`);
  }

  return expectedType;
}

function showStatus(type, message) {
  statusElement.className = `status visible ${type}`;
  statusElement.textContent = message;
}

function hideStatus() {
  statusElement.className = "status";
  statusElement.textContent = "";
}

function updateProgress(label) {
  const total = files.reduce((sum, item) => sum + item.file.size, 0);

  const uploadedBytes = files.reduce((sum, item) => {
    return sum + item.file.size * (item.progress / 100);
  }, 0);

  const percentage = total > 0 ? Math.round((uploadedBytes / total) * 100) : 0;

  progressSection.classList.add("visible");
  progressLabel.textContent = label;
  progressValue.textContent = `${percentage}%`;
  progressTrack.value = percentage;
}

function renderFiles() {
  imageList.replaceChildren();

  selectionArea.hidden = files.length === 0;

  const completed = files.filter((item) => item.status === "uploaded").length;
  selectionCount.textContent = `${files.length} selected · ${completed} uploaded`;

  for (const item of files) {
    const row = document.createElement("div");
    row.className = "image-item";

    const preview = document.createElement("img");
    preview.className = "preview";
    preview.src = item.previewUrl;
    preview.alt = item.file.name;

    const info = document.createElement("div");
    info.className = "image-info";

    const name = document.createElement("p");
    name.className = "image-name";
    name.textContent = item.file.name;

    const size = document.createElement("p");
    size.className = "image-size";
    size.textContent = formatSize(item.file.size);

    const statusText = document.createElement("span");
    statusText.className = `image-status ${item.status}`;

    const statusLabels = {
      queued: "Ready to upload",
      requesting: "Requesting secure URL...",
      uploading: `Uploading ${Math.round(item.progress)}%`,
      uploaded: "✓ Uploaded to S3",
      failed: `Failed: ${item.error}`,
    };

    statusText.textContent = statusLabels[item.status];

    info.append(name, size, statusText);

    if (item.status === "uploading") {
      const progress = document.createElement("progress");
      progress.className = "item-progress";
      progress.max = 100;
      progress.value = item.progress;
      info.append(progress);
    }

    const remove = document.createElement("button");
    remove.className = "remove-button";
    remove.type = "button";
    remove.textContent = "✕";
    remove.setAttribute("aria-label", `Remove ${item.file.name}`);
    remove.disabled = uploading;

    remove.addEventListener("click", () => removeFile(item.id));

    row.append(preview, info, remove);
    imageList.append(row);
  }

  const pending = files.filter(
    (item) => item.status === "queued" || item.status === "failed",
  ).length;

  uploadButton.disabled = uploading || pending === 0;

  if (pending > 0) {
    const imageLabel = pending === 1 ? "image" : "images";
    uploadButton.textContent = files.some((item) => item.status === "uploaded")
      ? `Upload / retry ${pending} remaining`
      : `Upload ${pending} ${imageLabel}`;
  } else if (files.length > 0) {
    uploadButton.textContent = "All images uploaded";
  } else {
    uploadButton.textContent = "Upload images";
  }
}

function addFiles(fileList) {
  if (uploading) return;

  hideStatus();

  let rejected = 0;
  let added = 0;

  for (const file of Array.from(fileList)) {
    try {
      getContentType(file);

      if (file.size === 0) {
        throw new Error("Empty files are not supported.");
      }

      const duplicate = files.some(
        (item) =>
          item.file.name === file.name &&
          item.file.size === file.size &&
          item.file.lastModified === file.lastModified,
      );

      if (duplicate) continue;

      files.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        idempotencyKey: crypto.randomUUID(),
        status: "queued",
        progress: 0,
        error: null,
      });

      added++;
    } catch {
      rejected++;
    }
  }

  fileInput.value = "";

  renderFiles();

  if (rejected > 0) {
    showStatus(
      "error",
      `${rejected} file(s) were rejected. Use non-empty JPG, JPEG, PNG or WEBP images with matching extensions and content types.`,
    );
  } else if (added > 0) {
    showStatus(
      "info",
      `${added} image(s) added. Review the previews and select Upload when ready.`,
    );
  }
}

function removeFile(id) {
  if (uploading) return;

  const item = files.find((file) => file.id === id);

  if (item) {
    URL.revokeObjectURL(item.previewUrl);
  }

  files = files.filter((file) => file.id !== id);

  renderFiles();
  hideStatus();
}

function clearFiles() {
  if (uploading) return;

  for (const item of files) {
    URL.revokeObjectURL(item.previewUrl);
  }

  files = [];
  fileInput.value = "";

  renderFiles();
  progressSection.classList.remove("visible");
  hideStatus();
}

async function getPresignedUrl(item) {
  const contentType = getContentType(item.file);

  const params = new URLSearchParams({
    filename: item.file.name,
    type: contentType,
  });

  const response = await fetch(`/api/presigned-url?${params.toString()}`, {
    method: "GET",
    headers: {
      "Idempotency-Key": item.idempotencyKey,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error ||
        data.message ||
        `Unable to generate upload URL (HTTP ${response.status}).`,
    );
  }

  if (!data.uploadUrl) {
    throw new Error("The API did not return an upload URL.");
  }

  return {
    uploadUrl: data.uploadUrl,
    imageId: data.imageId,
    key: data.key,
    contentType,
  };
}

function uploadToS3(item, uploadUrl, contentType) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        item.progress = (event.loaded / event.total) * 100;

        updateProgress(`Uploading ${item.file.name}...`);
        renderFiles();
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 returned HTTP ${xhr.status}.`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(
        new Error(
          "Network error during S3 upload. Check bucket CORS configuration.",
        ),
      );
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload cancelled."));
    });

    xhr.send(item.file);
  });
}

async function uploadOne(item) {
  try {
    item.status = "requesting";
    item.error = null;
    item.progress = 0;
    renderFiles();

    updateProgress(`Requesting URL for ${item.file.name}...`);

    const result = await getPresignedUrl(item);

    item.imageId = result.imageId;
    item.key = result.key;
    item.status = "uploading";

    renderFiles();

    await uploadToS3(item, result.uploadUrl, result.contentType);

    item.progress = 100;
    item.status = "uploaded";

    renderFiles();

    return true;
  } catch (error) {
    item.status = "failed";
    item.error =
      error instanceof Error ? error.message : "Unknown upload error";

    renderFiles();

    return false;
  }
}

async function uploadAll() {
  if (uploading) return;

  const pending = files.filter(
    (item) => item.status === "queued" || item.status === "failed",
  );

  if (pending.length === 0) return;

  uploading = true;
  uploadButton.disabled = true;
  fileInput.disabled = true;

  hideStatus();
  progressSection.classList.add("visible");

  let succeeded = 0;
  let failed = 0;

  try {
    await pending.reduce(async (previousUpload, item, index) => {
      await previousUpload;
      updateProgress(`Uploading image ${index + 1} of ${pending.length}...`);

      const success = await uploadOne(item);

      if (success) {
        succeeded++;
      } else {
        failed++;
      }
    }, Promise.resolve());

    const uploadedCount = files.filter(
      (item) => item.status === "uploaded",
    ).length;

    const failedCount = files.filter((item) => item.status === "failed").length;

    if (failedCount > 0) {
      showStatus(
        "error",
        `${succeeded} upload(s) succeeded and ${failedCount} failed. Failed images remain available for retry.`,
      );
    } else {
      showStatus(
        "success",
        `${succeeded} image(s) successfully uploaded to S3. The S3 notifications will trigger their individual asynchronous processing workflows. This confirms upload completion, not processing completion.`,
      );
    }

    updateProgress(`${uploadedCount} of ${files.length} images uploaded`);
  } finally {
    uploading = false;
    fileInput.disabled = false;
    renderFiles();
  }
}

fileInput.addEventListener("change", (event) => {
  addFiles(event.target.files);
});

clearButton.addEventListener("click", clearFiles);
uploadButton.addEventListener("click", uploadAll);

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragover");
  addFiles(event.dataTransfer.files);
});

renderFiles();
