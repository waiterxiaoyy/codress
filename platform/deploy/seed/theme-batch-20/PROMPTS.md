# Image generation prompt set

All 20 images used the built-in image generation path. Each request used the following production contract:

```text
Use case: stylized-concept
Asset type: Codress Codex or WorkBuddy desktop theme background
Style/medium: original premium 2D anime illustration, hand-painted animation background, pixel art, or cinematic concept art as specified
Composition/framing: wide 16:9 wallpaper, 2560x1440 intent
Constraints: background artwork only; no UI, no text, no logos, no watermark; original characters with no resemblance to existing franchises
Avoid: copyrighted characters, readable signs, interface mockups, clutter inside the declared safe area, blown highlights
```

Codex prompts used a 42–44% low-information safe area and explicit focal coordinates. WorkBuddy prompts used a 55% low-information left side, a right-side focal point around `x=0.80`, and a quiet lower-center area for the composer.

| Slug | Final subject and scene prompt | Palette / mood |
|---|---|---|
| `codex-sakura-signal` | Original young adult courier on the right third of an elevated futuristic rail platform at cherry-blossom dawn. | Midnight navy, sakura pink, cyan teal, warm peach; optimistic. |
| `codex-neon-torii-protocol` | Original armored pilot and restrained mechanical guardian on the right of a rain-polished mountain shrine merged with future machinery. | Near-black indigo, ultraviolet, muted crimson, cyan; determined. |
| `codex-rainbyte-alley` | Original programmer with umbrella on the right of a rainy cyberpunk alley with warm ramen lights and distant transit. | Deep navy, cyan, muted fuchsia, amber; contemplative. |
| `codex-astral-compiler` | Original astronomer-mage on the left of a hilltop observatory with brass instruments and text-free constellation ribbons. | Ink blue, violet, antique gold, pale cyan; serene wonder. |
| `codex-alpine-memory-line` | Blue mountain train curving through an alpine valley above a mirror lake, no people. | Alpine blue, sage, snow, coral details; fresh morning. |
| `codex-cloud-orchard` | Terraced orchard, cottage and windmill floating above a sea of clouds, no people. | Cream, olive, sky blue, ochre; restorative golden hour. |
| `codex-snowfox-commit` | Original shrine caretaker and small white fox spirit on the right of a cedar shrine in deep snow. | Deep blue, snow gray, vermilion, amber; hushed and protective. |
| `codex-abyssal-library` | Original archivist diver on the right of a submerged glass library ruin with blank books and tiny fish. | Abyss navy, turquoise, sea-glass green, soft gold; meditative. |
| `codex-sea-breeze-notebook` | Original young adult reading a blank notebook in an open-air study above a turquoise coast. | Marine blue, warm white, pale wood, muted coral; airy focus. |
| `codex-moonlit-archive-cathedral` | Small original archivist silhouette on the right of a gothic library-cathedral built on a lunar cliff. | Charcoal, moon silver, desaturated violet, brass; solemn. |
| `workbuddy-pastel-team-morning` | Original adult team coordinator arranging blank pastel notes on the right of a bright creative studio. | Cream, sage, dusty pink, sky blue; collaborative morning. |
| `workbuddy-stellar-standup` | Two original adult colleagues reviewing an abstract constellation model in an orbital coworking lounge. | Navy, violet, cyan, rose gold; aspirational teamwork. |
| `workbuddy-pixel-sprint-98` | Original adult pixel-art developer on the right of a cozy late-1990s-inspired studio over a rainy pixel city. | Deep plum, navy, amber, teal; nostalgic productivity. |
| `workbuddy-cloud-pavilion-sync` | Two original adult xianxia-inspired collaborators discussing a glowing abstract mountain model in a cloud pavilion. | Celadon, cloud white, ink blue, restrained gold; tranquil. |
| `workbuddy-island-focus-mode` | Original adult remote worker taking notes at an open bamboo workspace above a tropical lagoon. | Turquoise, palm green, sand, coral; relaxed focus. |
| `workbuddy-drizzle-cafe-standup` | Two original adult coworkers sharing a blank sketchbook on the right of a rain-window café. | Slate blue, coffee brown, coral, cream; cozy and thoughtful. |
| `workbuddy-aurora-basecamp` | Original expedition planner pinning blank markers inside a glass research cabin under the aurora. | Midnight navy, aurora green, ice blue, amber; resilient. |
| `workbuddy-neon-rhythm-lab` | Original adult vocalist-producer adjusting a text-free mixing surface in a neon city music studio. | Deep navy, hot pink, violet, cyan; creative momentum. |
| `workbuddy-greenhouse-after-rain` | Original adult botanist-designer arranging leaf samples on blank cards in a rain-wet greenhouse. | Forest green, jade, rain gray, brass; restorative. |
| `workbuddy-lantern-launch` | Three original adult teammates launching a small lantern together from a rooftop workshop. | Oxblood, indigo, warm gold, coral; hopeful achievement. |
