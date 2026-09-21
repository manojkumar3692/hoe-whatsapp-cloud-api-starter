// Standard ZIP (stored entries). PDFs are already compressed; no dependency or
// subprocess is needed. CRC and central directory make it portable to OS unzip.
export function createZip(entries: { name: string; data: Buffer }[]) {
  if (entries.length > 65535) throw new Error("Too many files for one archive.");
  const files: Buffer[] = [], directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    let crc = 0xffffffff;
    for (const byte of entry.data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6); header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(entry.data.length, 18);
    header.writeUInt32LE(entry.data.length, 22); header.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4);
    header.copy(central, 6, 4, 30); central.writeUInt32LE(offset, 42);
    files.push(header, name, entry.data); directory.push(central, name);
    offset += header.length + name.length + entry.data.length;
    if (offset > 0xffffffff) throw new Error("Archive exceeds ZIP size limit.");
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, central, end]);
}
