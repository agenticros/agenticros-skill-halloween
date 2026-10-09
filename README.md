# Creep or Treat

Stationary Halloween host for [AgenticROS](https://github.com/agenticros/agenticros). The robot stays plugged in and does not drive. A candy bowl sits at its feet. **YOLOv8n** watches the color camera for a real person; RealSense depth then picks the line from distance and approach speed. Furniture and the candy bowl alone do not start a visit.

```bash
npx agenticros skills install @agenticros/halloween
```

Until the package is published, load it from this directory (see [Install](#install)).

## What a kid hears

The loop runs YOLO on the color stream (~1.5 Hz) and samples depth a few times a second. Depth only counts while YOLO sees a person. One approach is one visit. The closest person wins when several kids bunch up.

| Zone | Distance | What it does |
|---|---|---|
| Idle | nothing, or beyond ~2.5 m | Quiet. A mutter about every 35 s: "The bowl is waiting." |
| Notice | ~1.6–2.5 m | Greeting. A creep is a quiet gasp. A walk is a normal hello. Left or right gets "On my left" or "On my right." |
| Closing | ~0.8–1.6 m | Still watching. A rush here screams once. |
| Bowl | ~0.4–0.8 m, held about a second | "Take one from the bowl at my feet." |
| Lens | under ~0.4 m | A scream, then "The candy is at my feet, not my face." |

Speed while they are closing:

- **Creep** — under ~0.25 m/s. Slow, higher, quieter.
- **Walk** — between a creep and a rush.
- **Rush** — over ~0.6 m/s. Plays `assets/scream.wav`, then one line. Once per visit.

Backing out past the notice zone ends the visit ("Happy haunting.", or "Yeah. Run." after a scream). The next kid can start a new one.

Ordinary lines wait about 2.5 s apart. Screams, the first greeting, and the goodbye skip that wait.

## Aim the camera over the bowl

With `requirePerson` (default **true**), YOLO must see a person before depth can start or continue a visit — so a bowl or chair in the depth image alone will not keep talking.

Still aim the RealSense so torsos are in the color frame and the candy bowl sits low or out of the depth image when you can. That keeps bowl/lens zones honest once a kid is close.

Under OpenClaw, YOLO runs in a short-lived Node child (`scripts/detect-person.mjs` in this skill) so `onnxruntime-node` / `sharp` load from `~/.agenticros/plugin-deploy` (or a sibling AgenticROS checkout) instead of OpenClaw's remapped native admissions. The gateway needs sharp's libvips on `LD_LIBRARY_PATH` (written into `~/.agenticros/gateway-ros.env` by AgenticROS `setup_gateway_plugin.sh`).

If YOLO cannot load, the skill logs a warning and falls back to depth-only. Set `requirePerson: false` to force that mode.

## Install

Speech plays on the computer running the OpenClaw gateway. Run the gateway on the robot so the speaker is the robot's.

```bash
sudo apt install espeak-ng alsa-utils
# espeak-ng is the voice. alsa-utils provides aplay for the scream.
```

On a Mac gateway, `espeak-ng` (Homebrew) and `afplay` work. `afplay` is already on macOS.

Build and register this checkout:

```bash
cd agenticros-skill-halloween
npm install
npm run build
npx agenticros skills add halloween
npx agenticros skills sync
```

Or point `skillPaths` at this directory and restart the gateway.

```jsonc
{
  "plugins": {
    "entries": {
      "agenticros": {
        "config": {
          "skillPaths": ["/absolute/path/to/agenticros-skill-halloween"],
          "skills": {
            "halloween": {
              "depthTopic": "/camera/camera/depth/image_rect_raw"
            }
          }
        }
      }
    }
  }
}
```

In chat: "Start the haunt." / "Stop haunting." / "How many kids?"

The tools are `start_haunt`, `stop_haunt`, and `haunt_status`. The capability id is `host_trick_or_treat` (verb `host`). It requires `camera` and `depth`. It does not require `base` or `arm`, and it never publishes `cmd_vel`.

## First night

Stand on the sidewalk, then creep in, walk in, run in, and lean toward the camera. The distances and the two speed thresholds are the knobs that matter. `haunt_status` shows the live zone, speed, visitor count, and last line.

If it screams at an empty porch, the bowl is in frame.

## Config (`config.skills.halloween`)

| Option | Default | Description |
|---|---|---|
| `depthTopic` | `/camera/camera/depth/image_rect_raw` | RealSense depth image. |
| `cameraTopic` | robot camera / compressed color | Color topic for YOLO (CompressedImage preferred). |
| `requirePerson` | `true` | Only greet when YOLO sees a person. |
| `personScoreThreshold` | `0.45` | Minimum YOLO confidence. |
| `personHz` | `1.5` | YOLO rate (keep below depth `rateHz` on Jetson). |
| `personMissTicks` | `3` | Missed YOLO frames before presence clears. |
| `rateHz` | `5` | Depth sample rate. |
| `depthTimeoutMs` | `1000` | Wait for one depth message. |
| `noticeM` | `2.5` | Greeting starts inside this. |
| `closingM` | `1.6` | Inside notice, outside the bowl. |
| `bowlM` | `0.8` | Standing at the bowl. |
| `lensM` | `0.4` | Leaning into the camera. |
| `minValidM` | `0.28` | Ignore nearer returns (bowl, floor, speckle). |
| `maxValidM` | `4` | Ignore farther returns. |
| `creepMaxMps` | `0.25` | Closing speed at or under this creeps. |
| `rushMinMps` | `0.6` | Closing speed at or over this screams. |
| `bowlHoldMs` | `1000` | How long they must hold at the bowl before the treat line. |
| `cooldownMs` | `2500` | Gap between ordinary lines. |
| `idleIntervalMs` | `35000` | Mutter period when nobody is there. |
| `espeakBin` | `espeak-ng` | TTS binary on the gateway machine. |
| `playerBin` | auto | `paplay`, `aplay`, or `afplay`. |
| `screamWav` | bundled | Override the scream. |
| `gaspWav` | bundled | Override the quiet arrival sound. |

If `noticeM`, `closingM`, `bowlM`, and `lensM` are out of order, the skill falls back to the defaults above.

## Develop

```bash
npm install
npm test
```

The zone machine is pure and covered without a camera or a speaker. `npm test` builds first, then runs `test/*.test.mjs`.

## License

Apache-2.0
