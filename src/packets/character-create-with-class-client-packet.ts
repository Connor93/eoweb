import {
  type EoWriter,
  type Gender,
  type Packet,
  PacketAction,
  PacketFamily,
} from 'eolib';

// Mirrors eolib's CharacterCreateClientPacket byte layout but appends a
// `classId` short in the first chunk, matching the reoserv deep packet:
// session_id, gender, hair_style, hair_color, skin, class | 0xFF | name | 0xFF.
export class CharacterCreateWithClassClientPacket implements Packet {
  sessionId = 0;
  gender: Gender = 0 as Gender;
  hairStyle = 0;
  hairColor = 0;
  skin = 0;
  classId = 0;
  name = '';

  get family(): PacketFamily {
    return PacketFamily.Character;
  }

  get action(): PacketAction {
    return PacketAction.Create;
  }

  serialize(writer: EoWriter): void {
    const oldStringSanitizationMode = writer.stringSanitizationMode;
    try {
      writer.stringSanitizationMode = true;
      writer.addShort(this.sessionId);
      writer.addShort(this.gender);
      writer.addShort(this.hairStyle);
      writer.addShort(this.hairColor);
      writer.addShort(this.skin);
      writer.addShort(this.classId);
      writer.addByte(0xff);
      writer.addString(this.name);
      writer.addByte(0xff);
      writer.stringSanitizationMode = false;
    } finally {
      writer.stringSanitizationMode = oldStringSanitizationMode;
    }
  }
}
