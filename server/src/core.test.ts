import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, timingSafeEqual } from "node:crypto";

describe("campaign idempotency keys", () => {
  it("produces stable keys for identical campaign payloads", () => {
    const key = (payload: string) =>
      createHash("sha256").update(payload).digest("hex");
    assert.equal(
      key("campaign:sender:recipient:subject:body"),
      key("campaign:sender:recipient:subject:body"),
    );
    assert.notEqual(
      key("campaign:sender:recipient:subject:body"),
      key("campaign:sender:recipient:subject:changed"),
    );
  });
});

describe("constant-time compare precondition", () => {
  it("only compares equal-length buffers", () => {
    const left = Buffer.from("state");
    const right = Buffer.from("state");
    assert.equal(
      left.length === right.length && timingSafeEqual(left, right),
      true,
    );
    assert.equal(
      left.length === Buffer.from("short").length &&
        timingSafeEqual(left, Buffer.from("short")),
      false,
    );
  });
});
