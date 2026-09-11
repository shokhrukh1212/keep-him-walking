# Paris artwork

Keep every source painting. The build command never generates or replaces artwork.

## Generation record

Generated with OpenAI image generation through Codex on 11 September 2026. The arrival
frame established the restrained gouache/digital editorial style, eye-level geometry,
3:1 crop and clear lower walking plane. Canal, market, café and landmark frames used it
only as a style reference and requested distinct silhouettes and locations. The night
landmark is an image edit of the day landmark with composition and camera held fixed.
All prompts excluded people, animals, vehicles, readable text, flags, logos, mirrored
elements and repeated landmarks. Visual and cultural acceptance remain with the owner.

## arrival

A wide painterly street panorama of The first steps outside Gare du Nord, with the station held once in the middle distance. in Paris, France, seen at eye level looking along the pavement, warm afternoon light, locally accurate architecture, materials and colours, empty pavement in the foreground running left to right at the lower fifth of the frame, no people, no readable text or signs, no flags, no vehicles in the foreground, gentle atmospheric depth, clean edges, storybook realism, consistent with a travel illustration series. Aspect 3:1.

Save as `art/paris/zones/paris-arrival/master.png`.

## lanes

A wide painterly street panorama of A quiet Canal Saint-Martin promenade with plane trees and an iron footbridge. in Paris, France, seen at eye level looking along the pavement, warm afternoon light, locally accurate architecture, materials and colours, empty pavement in the foreground running left to right at the lower fifth of the frame, no people, no readable text or signs, no flags, no vehicles in the foreground, gentle atmospheric depth, clean edges, storybook realism, consistent with a travel illustration series. Aspect 3:1.

Save as `art/paris/zones/paris-lanes/master.png`.

## market

A wide painterly street panorama of An intimate Marais market street inspired by the covered passages around Marché des Enfants Rouges. in Paris, France, seen at eye level looking along the pavement, warm afternoon light, locally accurate architecture, materials and colours, empty pavement in the foreground running left to right at the lower fifth of the frame, no people, no readable text or signs, no flags, no vehicles in the foreground, gentle atmospheric depth, clean edges, storybook realism, consistent with a travel illustration series. Aspect 3:1.

Save as `art/paris/zones/paris-market/master.png`.

## cafe

A wide painterly street panorama of A calm Left Bank corner café with an open side street and empty tables behind the walking line. in Paris, France, seen at eye level looking along the pavement, warm afternoon light, locally accurate architecture, materials and colours, empty pavement in the foreground running left to right at the lower fifth of the frame, no people, no readable text or signs, no flags, no vehicles in the foreground, gentle atmospheric depth, clean edges, storybook realism, consistent with a travel illustration series. Aspect 3:1.

Save as `art/paris/zones/paris-cafe/master.png`.

## landmark

A wide painterly street panorama of A broad Seine promenade opening onto a single Eiffel Tower view at golden hour. in Paris, France, seen at eye level looking along the pavement, warm afternoon light, locally accurate architecture, materials and colours, empty pavement in the foreground running left to right at the lower fifth of the frame, no people, no readable text or signs, no flags, no vehicles in the foreground, gentle atmospheric depth, clean edges, storybook realism, consistent with a travel illustration series. Aspect 3:1.

Save as `art/paris/zones/paris-landmark/master.png`.

## Landmark night

Use the The Seine and Eiffel Tower master as img2img: same scene at night, warm lit windows, a few street lamps, deep blue sky, no people. Keep denoise between 0.35 and 0.45.

Save as `art/paris/zones/paris-landmark/night.png`.

## Foreground cutouts

Create two or three locally ordinary foreground objects for Paris, such as a lamp post, tree, kiosk or fountain edge, isolated on flat magenta, with no people, flags or readable text. Cutouts remain optional because the runtime has procedural foreground details.

## Build

Run `pnpm pack:build paris`. It requires all five masters and the landmark night image. The build derives a bounded city painting, soft sky plate and edge-audited moving pavement from each master. Optional `lights.png` files beside any master become dusk overlays.
