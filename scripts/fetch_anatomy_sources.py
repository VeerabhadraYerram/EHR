"""Download official BodyParts3D source tables/archive and CRC-checked muscle entries.
The source archive is ignored by Git; converted GLBs and attribution are packaged.
"""

import concurrent.futures, csv, io, struct, urllib.request, zipfile, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "data/anatomy/source"
BASE = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/"


def fetch_range(url, start, end):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(
                urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}"}),
                timeout=90,
            ) as r:
                if r.status != 206:
                    raise ValueError("Server did not honor byte range")
                return r.read()
        except Exception:
            if attempt == 2:
                raise


class RemoteZIP(io.RawIOBase):
    def __init__(self, url, size):
        self.url, self.size, self.pos = url, size, 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        self.pos = (
            offset
            if whence == 0
            else self.pos + offset if whence == 1 else self.size + offset
        )
        return self.pos

    def read(self, n=-1):
        n = self.size - self.pos if n < 0 else min(n, self.size - self.pos)
        if n <= 0:
            return b""
        data = fetch_range(self.url, self.pos, self.pos + n - 1)
        self.pos += len(data)
        return data


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    for name in [
        "partof_parts_list_e.txt",
        "partof_element_parts.txt",
        "isa_parts_list_e.txt",
        "isa_element_parts.txt",
    ]:
        if not (ROOT / name).exists():
            urllib.request.urlretrieve(BASE + name, ROOT / name)
    target = ROOT / "partof_BP3D_4.0_obj_99.zip"
    valid = False
    if target.exists():
        try:
            with zipfile.ZipFile(target) as z:
                valid = z.testzip() is None
        except zipfile.BadZipFile:
            pass
    if not valid:
        url = BASE + target.name
        size = int(
            urllib.request.urlopen(urllib.request.Request(url, method="HEAD")).headers[
                "Content-Length"
            ]
        )
        chunk = 1048576

        def part(i):
            start = i * chunk
            end = min(size, start + chunk) - 1
            return start, fetch_range(url, start, end)

        with target.open("wb") as out, concurrent.futures.ThreadPoolExecutor(
            max_workers=12
        ) as pool:
            out.truncate(size)
            for offset, data in pool.map(part, range((size + chunk - 1) // chunk)):
                out.seek(offset)
                out.write(data)
    muscle = ROOT / "muscles-selected.zip"
    if True:  # Extend an existing selection when new systems are requested.
        url = BASE + "isa_BP3D_4.0_obj_99.zip"
        size = int(
            urllib.request.urlopen(urllib.request.Request(url, method="HEAD")).headers[
                "Content-Length"
            ]
        )
        with (ROOT / "isa_element_parts.txt").open() as f:
            ids = {
                r["element file id"]
                for r in csv.DictReader(f, delimiter="\t")
                if r["concept id"] in ["FMA5022", "FMA5018", "FMA5913", "FMA65132"]
            }
        existing = set()
        if muscle.exists():
            with zipfile.ZipFile(muscle) as current:
                existing = set(current.namelist())
        with zipfile.ZipFile(RemoteZIP(url, size)) as z:
            infos = [
                i
                for i in z.infolist()
                if Path(i.filename).stem in ids and i.filename not in existing
            ]
        print("Additional licensed mesh entries:", len(infos), flush=True)

        def entry(info):
            raw = fetch_range(
                url,
                info.header_offset,
                min(
                    size - 1,
                    info.header_offset
                    + 30
                    + len(info.filename.encode())
                    + len(info.extra)
                    + info.compress_size
                    + 256,
                ),
            )
            header = struct.unpack("<4s5H3I2H", raw[:30])
            offset = 30 + header[-2] + header[-1]
            data = raw[offset : offset + info.compress_size]
            data = zlib.decompress(data, -15) if info.compress_type == 8 else data
            if zlib.crc32(data) != info.CRC:
                raise ValueError("CRC mismatch: " + info.filename)
            return info.filename, data

        with zipfile.ZipFile(
            muscle, "a", zipfile.ZIP_DEFLATED
        ) as out, concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            for name, data in pool.map(entry, infos):
                out.writestr(name, data)
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
    with zipfile.ZipFile(muscle) as z:
        assert z.testzip() is None
    print(
        "Source archive CRC checks passed. Run python scripts/build_anatomy_assets.py"
    )


if __name__ == "__main__":
    main()
