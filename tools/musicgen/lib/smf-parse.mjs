/**
 * Standard MIDI File reader, the inverse of smf.mjs.
 *
 * It exists so the build can verify its own output: the invariant suite reads
 * every emitted track back and checks note pairing, loop-seam safety and mode
 * conformance against the bytes that actually ship, rather than against the
 * in-memory structures that produced them.
 */

function readVarint(bytes, offset) {
  let value = 0;
  let cursor = offset;
  for (;;) {
    const byte = bytes[cursor];
    cursor += 1;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      return { value, offset: cursor };
    }
  }
}

function readChunkId(bytes, offset) {
  return String.fromCharCode(...bytes.slice(offset, offset + 4));
}

function readUint32(bytes, offset) {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function parseTrack(bytes, start, end) {
  const events = [];
  let offset = start;
  let tick = 0;
  let runningStatus = 0;

  while (offset < end) {
    const delta = readVarint(bytes, offset);
    tick += delta.value;
    offset = delta.offset;

    let status = bytes[offset];
    if (status < 0x80) {
      status = runningStatus;
    } else {
      offset += 1;
    }

    if (status === 0xff) {
      const type = bytes[offset];
      offset += 1;
      const length = readVarint(bytes, offset);
      offset = length.offset;
      const data = bytes.slice(offset, offset + length.value);
      offset += length.value;

      if (type === 0x2f) {
        events.push({ tick, type: 'endOfTrack' });
      } else if (type === 0x51) {
        const usPerQuarter = (data[0] << 16) | (data[1] << 8) | data[2];
        events.push({ tick, type: 'tempo', bpm: 60000000 / usPerQuarter });
      } else if (type === 0x58) {
        events.push({
          tick,
          type: 'timeSignature',
          numerator: data[0],
          denominator: 2 ** data[1],
        });
      } else if (type === 0x03) {
        events.push({
          tick,
          type: 'trackName',
          text: String.fromCharCode(...data),
        });
      }
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      const length = readVarint(bytes, offset);
      offset = length.offset + length.value;
      continue;
    }

    runningStatus = status;
    const command = status & 0xf0;
    const channel = status & 0x0f;

    if (command === 0x80 || command === 0x90) {
      const pitch = bytes[offset];
      const velocity = bytes[offset + 1];
      offset += 2;
      // A note on with zero velocity is the conventional release; normalise it
      // so pairing checks do not have to know both spellings.
      const isRelease = command === 0x80 || velocity === 0;
      events.push({
        tick,
        type: isRelease ? 'noteOff' : 'noteOn',
        channel,
        pitch,
        velocity,
      });
    } else if (command === 0xc0) {
      events.push({ tick, type: 'program', channel, program: bytes[offset] });
      offset += 1;
    } else if (command === 0xd0) {
      offset += 1;
    } else if (command === 0xb0) {
      events.push({
        tick,
        type: 'controller',
        channel,
        cc: bytes[offset],
        value: bytes[offset + 1],
      });
      offset += 2;
    } else {
      offset += 2;
    }
  }

  return events;
}

export function parseMidi(bytes) {
  if (readChunkId(bytes, 0) !== 'MThd') {
    throw new Error('not a Standard MIDI File: missing MThd');
  }

  const ticksPerBeat = (bytes[12] << 8) | bytes[13];
  const tracks = [];

  let offset = 8 + readUint32(bytes, 4);
  while (offset < bytes.length) {
    const id = readChunkId(bytes, offset);
    const length = readUint32(bytes, offset + 4);
    if (id === 'MTrk') {
      tracks.push(parseTrack(bytes, offset + 8, offset + 8 + length));
    }
    offset += 8 + length;
  }

  return { ticksPerBeat, tracks };
}
