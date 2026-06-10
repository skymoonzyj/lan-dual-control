import { createHash } from "node:crypto";

const websocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export function makeAcceptKey(key) {
  return createHash("sha1")
    .update(`${key}${websocketGuid}`)
    .digest("base64");
}

export function encodeTextFrame(payload) {
  const body = Buffer.from(payload, "utf8");

  if (body.length < 126) {
    return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  }

  if (body.length <= 0xffff) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
    return Buffer.concat([header, body]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(body.length), 2);
  return Buffer.concat([header, body]);
}

export function decodeFrames(buffer) {
  const messages = [];
  let offset = 0;

  while (buffer.length - offset >= 2) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let headerLength = 2;

    if (length === 126) {
      if (buffer.length - offset < 4) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (buffer.length - offset < 10) break;
      length = Number(buffer.readBigUInt64BE(offset + 2));
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + length;
    if (buffer.length - offset < frameLength) break;

    if (opcode === 0x8) {
      messages.push({ type: "close" });
      offset += frameLength;
      continue;
    }

    if (opcode !== 0x1) {
      offset += frameLength;
      continue;
    }

    const maskStart = offset + headerLength;
    const payloadStart = maskStart + maskLength;
    const payload = Buffer.from(buffer.subarray(payloadStart, payloadStart + length));

    if (masked) {
      const mask = buffer.subarray(maskStart, maskStart + 4);
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }

    messages.push({
      type: "text",
      body: payload.toString("utf8"),
    });
    offset += frameLength;
  }

  return {
    messages,
    rest: buffer.subarray(offset),
  };
}
