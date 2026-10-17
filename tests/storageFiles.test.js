/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  storageReference,
  resolveStorageFile,
  isImageFile,
} from "../src/utils/storageFiles.js";

const origin = "https://example.supabase.co";
test("storage references retain actual bucket, nested folders and decoded names", () => {
  for (const kind of ["public", "sign", "authenticated"]) {
    assert.deepEqual(
      storageReference(
        `${origin}/storage/v1/object/${kind}/original-photos/folder/photo%20one.jpg?token=expired`,
        "material-photos",
        origin,
      ),
      { bucket: "original-photos", path: "folder/photo one.jpg" },
    );
  }
  assert.deepEqual(
    storageReference("folder/photo.jpg", "material-photos", origin),
    { bucket: "material-photos", path: "folder/photo.jpg" },
  );
  assert.equal(
    storageReference(
      "https://external.example/photo.jpg",
      "material-photos",
      origin,
    ),
    null,
  );
});
test("lightbox paths are resolved to signed URLs, including expired URLs", async () => {
  const calls = [];
  const client = {
    storage: {
      from: (bucket) => ({
        createSignedUrl: async (path, expiry) => {
          calls.push({ bucket, path, expiry });
          return {
            data: { signedUrl: "https://example.supabase.co/fresh.jpg" },
            error: null,
          };
        },
      }),
    },
  };
  assert.equal(
    await resolveStorageFile(
      client,
      "folder/photo.jpg",
      "material-photos",
      origin,
    ),
    `${origin}/fresh.jpg`,
  );
  await resolveStorageFile(
    client,
    `${origin}/storage/v1/object/sign/worker-documents/before.jpg?token=old`,
    "material-photos",
    origin,
  );
  assert.deepEqual(calls, [
    { bucket: "material-photos", path: "folder/photo.jpg", expiry: 3600 },
    { bucket: "worker-documents", path: "before.jpg", expiry: 3600 },
  ]);
});
test("unavailable files fail explicitly and external URLs stay intact", async () => {
  const client = {
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: null,
          error: new Error("Not found"),
        }),
      }),
    },
  };
  await assert.rejects(
    resolveStorageFile(client, "missing.jpg", "material-photos", origin),
    /Not found/,
  );
  assert.equal(
    await resolveStorageFile(
      client,
      "https://external.example/photo.jpg",
      "material-photos",
      origin,
    ),
    "https://external.example/photo.jpg",
  );
  assert.equal(isImageFile("photo.JPG?token=abc"), true);
  assert.equal(isImageFile("document.pdf"), false);
});

test("public downloads still work when signing is not permitted", async () => {
  const url = `${origin}/storage/v1/object/public/original-photos/document.jpg`;
  const client = {
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: null,
          error: new Error("No select policy"),
        }),
      }),
    },
  };
  assert.equal(
    await resolveStorageFile(client, url, "material-photos", origin),
    url,
  );
});
