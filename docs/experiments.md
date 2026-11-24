# Creative experiments

These experiments ran in the disposable integrated Overworld on Minecraft 26.3, MCPFabric 0.10.0 and WorldEdit 7.4.6. The reserved aerial area kept high-volume and repeatable samples clear of the natural terrain. A second tower sits beside an 11-block descent on the lakeside hill. Geometry and texturing were executed through the stock MCPFabric QuickJS runtime. [Hillside view](../screenshots/hillside-watchtower-and-road.png) · [Live measurements](../experiments/live-results.jsonl) · [Geometry source](../experiments/sample.js) · [Benchmarks](../benchmarks/README.md)

## Parametric tower — pass

The first tower at (25, 167, 42) has a 30-block wall, 7-block base radius, two-block taper and wall thickness, entrance arch, slit windows and a nine-block conical copper roof. Its 2,059 blocks collapsed into 322 vertical runs. One `run_skill` made 328 bridge calls including the site survey. Starting with the same saved program, a second call requested height 34, radius 8, taper 3, thickness 1 and roof height 13. It changed 2,898 cells in 620 runs, including removal of old wall and roof cells. A fresh world scan found zero pending writes for both versions. [Original view](../screenshots/tower-original-northwest.png) · [Revised view](../screenshots/tower-revised-northwest.png)

The sample compares the supplied prior parameters with the new shape. It skips occupied cells that differ from both expected values and uses block-ID replacement filters when writing. Its guard does not track block-entity data, state properties, concurrent transactions or object identity. A timeout can leave completed runs in place. Inspect the same parameter pair before resuming.

## Five stone treatments — pass

Each 17 × 9 wall carries the same projecting slab ledge. The camera translated with the wall at constant angle and distance. The scene used noon light. Every sample passed a full independent readback of 158 voxels. The seed was 42.

| Treatment | What changed | Equal horizontal neighbour pairs out of 144 |
| --- | --- | ---: |
| [Uniform](../screenshots/wall-uniform-north.png) | Stone separates lighting and silhouette from material variation | 144 |
| [Independent random](../screenshots/wall-random-north.png) | Each cell independently draws a palette index | 31 |
| [Height gradient](../screenshots/wall-gradient-north.png) | Five horizontal material bands | 144 |
| [Coherent noise](../screenshots/wall-cluster-north.png) | Smooth interpolation across a four-block lattice | 115 |
| [Contextual weathering](../screenshots/wall-weathered-north.png) | Height and coherent noise plus darker material at the foundation and under the ledge | 121 |

These pair counts come from the deterministic fixture. They describe clustering, not artistic quality. In the captures, the random wall breaks into individual spots, the gradient has visible bands, and the contextual treatment leaves larger quiet regions. Polished andesite and smooth stone give the upper areas a distinct tile pattern. WorldEdit's weighted pattern passed the live integration check. The scripted field gives control over seed, cluster scale and local shade influences in one reusable design. The ledge's shade is a specified local mask, without light transport or occlusion estimation. [Offline checks](../experiments/offline-results.json) · [WorldEdit evidence](worldedit-results.json)

## Organic road and hillside site — pass

Downward rays sampled 550 points on a four-block grid. Water occupied 192 samples, and oak or birch leaves occupied 114. The open hillside near (0, 98, 76) offered a 25-column route with 11 blocks of descent. The first trial's shallow vertical scan and level-shoulder assumption produced gaps. The revised script sampled 31 vertical blocks, allowed small cuts and supported raised shoulders with cobblestone. The final inspection found a continuous centerline with at most one block of grade change per column. Width varied between three and five blocks. Path, coarse dirt and gravel vary between the center and shoulders. [Terrain survey](../experiments/terrain-survey.json) · [Road script](../experiments/road.js)

The road changed 112 cells, including 14 vegetation clearances. Each changed position was read back by its world coordinate. A single `run_script` needed 237 bridge calls and 0.4 seconds, including survey and verification. The road follows the grade visibly. Width changes are abrupt in a few spots and the surface steps would benefit from slabs on a longer route. [Before](../screenshots/road-before.png) · [After](../screenshots/road-after.png)

A separate 30-block-wall tower at (9, 96, 86) anchors the road at its entrance. Its footing fitted 199 cobblestone blocks into the changing grade, with independent readback. A conditional build placed 2,023 wall and roof cells and kept 68 occupied terrain and path cells intact. Readback found zero outstanding eligible changes. The game is in Creative at (-16.5, 96, 51.5) facing this site. [Hillside readback](../experiments/hillside-results.json) · [Finished view](../screenshots/hillside-watchtower-and-road.png)

## Collaborative gate revisions — partial pass

The gate started with 85 blocks at (56, 167, 50). A separate `set_block` simulates a human inserting a waxed copper block at (57, 167, 50). Three revisions moved the entrance, pitched the roof and raised the wall while darkening the foundation. They wrote 18, 54 and 109 cells in 6, 54 and 97 runs. Each revision used the prior parameter set, a current bounded scan and the new parameters. Inspect, apply and independent readback required three scripted MCP requests per revision. The final inspect reported the preserved copper exactly where the design proposed tuff. [Before](../screenshots/gate-initial.png) · [After](../screenshots/gate-revised.png)

**Human Axiom check, pending.** In the existing revision-3 gate, use Axiom to replace the copper marker at (57, 167, 50) with a **diamond block** and place a **lapis block** at (69, 167, 50), two blocks beyond the roof. Close the editor. From the repository root run `& "$env:ProgramFiles/nodejs/node.exe" experiments/manual-gate.mjs`. This lowers the wall from seven to five blocks and revises the foundation by applying revision 2 with previous revision 3. It first checks that the wall is tall, the proposed changes are nonempty and the two manual blocks are present. It reads the complete 495-cell region before and after, checks that the old wall cell at (56, 173, 50) became air and verifies both manual edits. Diamond differs from both tuff and the newly proposed stone bricks. The fixture writes full readbacks under `local/manual-gate-readbacks.json` on success. [Manual fixture](../experiments/manual-gate.mjs)

## Reproduction

Run the scripts from the repository root using Node.js 22.16 or newer and the installed stock MCP bundle. The sample accepts `describe` without a world, `inspect` without writing, or `apply` for the pinned disposable world and origin. The first command below inspects the already-built revision.

```powershell
$node = "$env:ProgramFiles/nodejs/node.exe"
& $node experiments/run.mjs sample '{"sample":"gate","worldId":"sp:WorldStudioLab","origin":{"x":56,"y":167,"z":50},"revision":3,"previous":{"revision":2},"action":"inspect"}'
& $node experiments/check.mjs
```

For a fresh full run, create a new isolated copy of the lab using the original terrain seed and `sp:WorldStudioLab` save-folder name. Run `gallery.mjs tower`, `gallery.mjs walls`, `gallery.mjs gate`, `survey.mjs`, `gallery.mjs road 0 98 76`, `hillside.mjs` and `showcase.mjs` from the experiments folder with the repository root as the working directory (for example, `& $node experiments/gallery.mjs tower`). Capture filenames are reused by the gallery runner. On the completed lab, `tower-recapture` explicitly reverses the five parameter changes and reapplies them. Other destructive selectors expect fresh footprints. Axiom hand edits belong in the disposable lab and can be backed up before rerunning a fixture.

The offline runner exercises the release QuickJS VM with explicit in-memory terrain and block observations. Its output validates the geometry and catches fixture regressions. The live runner uses stock MCP tools and records separate, real-world evidence. The measured tool timings exclude model generation.
