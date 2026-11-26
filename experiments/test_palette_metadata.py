"""Regression checks for pack overlays, linear-light averaging and unsupported models."""
from importlib.util import module_from_spec, spec_from_file_location
from io import BytesIO
import json
from pathlib import Path
import unittest
from zipfile import ZipFile

from PIL import Image


spec = spec_from_file_location("palette_metadata", Path(__file__).with_name("palette-metadata.py"))
sampler = module_from_spec(spec)
spec.loader.exec_module(sampler)


def png(colors):
    stream = BytesIO()
    image = Image.new("RGB", (2,2))
    image.putdata(colors)
    image.save(stream, format="PNG")
    return stream.getvalue()


class PaletteTests(unittest.TestCase):
    def test_linear_light_average_and_direction(self):
        black, white = (0,0,0), (255,255,255)
        value = sampler.measure(png([black,white,black,white]))
        self.assertAlmostEqual(value["meanOKLab"][0], .5**(1/3), places=5)
        self.assertAlmostEqual(value["meanAdjacentDeltaL"]["x"], 1)
        self.assertEqual(value["meanAdjacentDeltaL"]["y"], 0)

    def test_inherited_model_with_pack_override_and_explicit_unknown(self):
        parent = {"elements":[{"from":[0,0,0],"to":[16,16,16],"faces":{
            direction:{"texture":"#all"} for direction in ("up","down","north","south","east","west")}}]}
        variant = {"variants":{"":{"model":"minecraft:block/sample"}}}
        path = "assets/minecraft/textures/block/sample.png"
        with ZipFile(BytesIO(),"w") as base, ZipFile(BytesIO(),"w") as overlay:
            base.writestr("assets/minecraft/blockstates/sample.json",json.dumps(variant))
            base.writestr("assets/minecraft/blockstates/lamp.json",json.dumps({"multipart":[]}))
            base.writestr("assets/minecraft/models/block/cube.json",json.dumps(parent))
            base.writestr("assets/minecraft/models/block/sample.json",json.dumps({
                "parent":"block/cube","textures":{"all":"minecraft:block/sample"}}))
            base.writestr(path, png([(0,0,0)]*4))
            overlay.writestr(path, png([(255,255,255)]*4))
            report = sampler.analyze([base,overlay], ["sample","lamp"])
            self.assertIn("lamp",report["unsupported"])
            face = report["blocks"]["sample"]["north"]
            self.assertEqual(report["textures"][face]["meanOKLab"][0],1)
            overlay.writestr(path+".mcmeta",json.dumps({"animation":{}}))
            report = sampler.analyze([base,overlay], ["sample"])
            self.assertIn("animated",report["unsupported"]["sample"])


if __name__ == "__main__":
    unittest.main()
