"""Measure untinted, opaque full-cube faces from a client JAR and optional pack ZIPs."""
import argparse
from contextlib import ExitStack
from functools import cache
from hashlib import file_digest
from io import BytesIO
import json
from pathlib import Path
from statistics import pstdev
from zipfile import ZipFile

from PIL import Image


def linear(channel):
    s = channel / 255
    return s / 12.92 if s <= .04045 else ((s + .055) / 1.055) ** 2.4


def oklab(rgb):
    r, g, b = rgb
    l = (.4122214708*r + .5363325363*g + .0514459929*b) ** (1/3)
    m = (.2119034982*r + .6806995451*g + .1073969566*b) ** (1/3)
    s = (.0883024619*r + .2817188376*g + .6299787005*b) ** (1/3)
    return (.2104542553*l + .793617785*m - .0040720468*s,
            1.9779984951*l - 2.428592205*m + .4505937099*s,
            .0259040371*l + .7827717662*m - .8086757660*s)


def measure(data):
    with Image.open(BytesIO(data)) as image:
        rgba = image.convert("RGBA")
        width, height = rgba.size
        if width != height or rgba.getchannel("A").getextrema() != (255, 255):
            raise ValueError("non-square or translucent texture")
        samples = [tuple(linear(c) for c in rgba.getpixel((x,y))[:3]) for y in range(height) for x in range(width)]
    mean = [sum(channels)/len(samples) for channels in zip(*samples)]
    values = [oklab(sample)[0] for sample in samples]
    horizontal = [abs(values[i+1]-v) for i,v in enumerate(values) if i%width < width-1]
    vertical = [abs(values[i+width]-v) for i,v in enumerate(values) if i+width < len(values)]
    return {"pixelsPerSide": width, "meanOKLab": [round(v, 5) for v in oklab(mean)],
            "pixelLightnessSD": round(pstdev(values), 5),
            "meanAdjacentDeltaL": {direction: round(sum(edges)/max(1,len(edges)), 5)
                                    for direction,edges in (("x",horizontal),("y",vertical))}}


def asset(identifier, folder, suffix):
    namespace, _, name = identifier.partition(":")
    if not name:
        name, namespace = namespace, "minecraft"
    return f"assets/{namespace}/{folder}/{name}{suffix}"


def analyze(archives, blocks):
    def read(path):
        for archive in reversed(archives):
            try:
                return archive.read(path)
            except KeyError:
                continue
        raise KeyError(path)

    def model_faces(identifier):
        textures, elements, seen = {}, None, set()
        while identifier:
            if identifier in seen:
                raise ValueError("cyclic model parent")
            seen.add(identifier)
            model = json.loads(read(asset(identifier, "models", ".json")))
            textures = {**model.get("textures", {}), **textures}
            if elements is None:
                elements = model.get("elements")
            identifier = model.get("parent")
        if len(elements or []) != 1:
            raise ValueError("requires a single full cube")
        cube = elements[0]
        if cube["from"] != [0,0,0] or cube["to"] != [16,16,16] or "rotation" in cube:
            raise ValueError("non-cube geometry")
        faces = {}
        for direction in ("up","down","north","south","west","east"):
            face = cube["faces"][direction]
            if "tintindex" in face or face.get("uv", [0,0,16,16]) != [0,0,16,16] or face.get("rotation", 0):
                raise ValueError("tinted, rotated or cropped face")
            name = face["texture"]
            visited = set()
            while name.startswith("#"):
                if name in visited:
                    raise ValueError("cyclic texture reference")
                visited.add(name)
                name = textures[name[1:]]
            faces[direction] = name if ":" in name else "minecraft:"+name
        return faces

    @cache
    def texture(name):
        path = asset(name, "textures", ".png")
        try:
            if "animation" in json.loads(read(path+".mcmeta")):
                raise ValueError("animated texture")
        except KeyError:
            pass
        return measure(read(path))

    result = {"blocks": {}, "textures": {}, "unsupported": {}}
    for block in sorted(set(blocks)):
        try:
            state = json.loads(read(asset(block,"blockstates",".json")))
            if set(state.get("variants", {})) != {""}:
                raise ValueError("requires a stateless model")
            variant = state["variants"][""]
            if not isinstance(variant,dict) or variant.get("x") or variant.get("y"):
                raise ValueError("weighted or rotated variant")
            faces = model_faces(variant["model"])
            measurements = {name:texture(name) for name in sorted(set(faces.values()))}
            result["textures"].update(measurements)
            result["blocks"][block] = faces
        except (KeyError, ValueError) as exc:
            result["unsupported"][block] = str(exc)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("jar", type=Path)
    parser.add_argument("blocks", nargs="+")
    parser.add_argument("--pack", type=Path, action="append", default=[], help="ZIP overlay; highest priority last")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    paths = [args.jar, *args.pack]
    with ExitStack() as stack:
        archives = [stack.enter_context(ZipFile(path)) for path in paths]
        for pack in archives[1:]:
            settings = json.loads(pack.read("pack.mcmeta"))
            if "overlays" in settings or "filter" in settings:
                parser.error("Pack filters and versioned overlays need game-side resolution.")
        report = analyze(archives, args.blocks)
    report["layersLowToHigh"] = []
    for path in paths:
        with path.open("rb") as archive:
            report["layersLowToHigh"].append({"file": path.name, "sha256": file_digest(archive,"sha256").hexdigest()})
    serialized = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.write_text(serialized, encoding="utf-8")
    else:
        print(serialized, end="")
