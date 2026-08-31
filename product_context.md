Yes to both—and I would still choose 2D.

For this idea, high-quality 2D may actually be better than 3D: it can feel warmer, more recognizable, load faster on mobile and make the traveler feel like a real internet character rather than a generic game avatar.

The important distinction is:

- Cheap 2D: stock vector character repeating one walk cycle.
- Premium 2D: carefully art-directed character, skeletal rigging, expressive acting, parallax, lighting, shadows, sound and cinematic camera movement.

## Conversations should become major events

I agree that five or six actions across an entire day would become boring. But I wouldn’t make visitors wait 20 minutes before anything happens, because most new visitors will leave before then.

Use several levels of activity:

| Frequency           | What happens                                                                |
| ------------------- | --------------------------------------------------------------------------- |
| Every 20–60 seconds | Looks around, adjusts backpack, checks map, waves, reacts to weather        |
| Every 3–5 minutes   | Takes a photo, drinks water, checks phone, sits briefly, examines something |
| Every 15–30 minutes | Meets someone and has a real conversation                                   |
| 3–4 times daily     | Major event, community vote result or sponsored interaction                 |

This makes the world feel alive without requiring hundreds of unique animations.

## How a conversation would work

The traveler is walking. Then:

## He notices someone.

## His walking animation slows. ## He turns toward the person. ## The camera gently moves closer. ## The other character waves or greets him. ## Speech bubbles appear. ## Both characters react while speaking. ## They say goodbye. ## He returns to walking.

The complete encounter might last 30–60 seconds.

Example:

> **Traveler:** Excuse me—what should I try while I’m in Tashkent? > **Local:** You haven’t eaten plov yet? > **Traveler:** Not yet. Is that a problem? > **Local:** A very serious problem. Follow me.

Later, he arrives at a plov restaurant. Therefore, the conversation is not merely decoration—it creates the next part of the daily story.

I would not use a traditional centered modal. That would feel like a SaaS popup. Use speech bubbles anchored to the characters, with a slightly darkened background and subtle camera zoom. On small mobile screens, the dialogue can move into an elegant bottom panel.

## Yes, all the actions are possible in 2D

We can create:

- Walking and changing speed.
- Turning and approaching another person.
- Talking, listening, nodding and laughing.
- Drinking coffee or water.
- Eating.
- Checking a travel app.
- Using a laptop.
- Taking a photograph.
- Holding a product.
- Sitting on a bench.
- Entering a café or shop.
- Reacting to rain, wind or snow.
- Wearing sponsor clothing.
- Changing the backpack patch.
- Entering a car, train, boat or plane.
- Handshakes, waves and high-fives.

The character does not need to be redrawn for every action. We build a reusable skeleton with bones controlling the body, hands, eyes, mouth, clothing and backpack.

Rive supports bones, constraints, timelines and state-machine logic for connecting animations. Its joystick rigging can control sophisticated combinations of eyes, mouth, hands and body poses. [Rive rigging documentation](https://rive.app/docs/editor/manipulating-shapes/joysticks), [Rive state machines](https://rive.app/docs/editor/state-machine/state-machine)

For example, the traveler can have animation states such as:

> `walking → noticing → approaching → talking → reacting → goodbye → walking`

The application triggers these states according to the global event schedule.

## My recommended visual architecture

I would build it as a hybrid 2D/2.5D product:

| Layer                  | Recommended system | Responsibility                                             |
| ---------------------- | ------------------ | ---------------------------------------------------------- |
| Traveler and NPCs      | Rive               | Character rigging, expressions and actions                 |
| Country environment    | PixiJS             | Parallax, particles, lighting, weather and camera          |
| Dialogue and interface | React/HTML         | Speech bubbles, translations, voting and sponsor CTA       |
| Story scheduler        | Backend timestamps | Ensures everyone sees the same live events                 |
| Sound                  | Web Audio          | Footsteps, streets, cafés, weather and conversation sounds |

PixiJS is specifically designed for high-performance interactive 2D content through WebGPU/WebGL. [PixiJS](https://pixijs.com/)

Rive’s web runtime supports TypeScript, WebGL2 and interactive state machines, while data binding can dynamically change text, images, booleans and other scene properties. That would let us swap sponsor patches, props, clothing and expressions without creating a completely new character file. [Rive web runtime](https://rive.app/docs/runtimes/web/web-js), [Rive data binding](https://rive.app/docs/runtimes/data-binding)

### When Spine would be preferable

If the product eventually contains dozens of characters on screen, highly detailed raster artwork and more game-like animation, Spine combined with PixiJS would offer more control. Spine has an official maintained PixiJS runtime supporting WebGL, WebGPU and the full set of Spine features. It does require a commercial Spine license and a more specialized animation workflow. [Spine’s PixiJS runtime](https://esotericsoftware.com/spine-pixi)

For the first premium version, I recommend **Rive + PixiJS**. It is enough for one traveler, one or two NPCs and a sophisticated interactive scene.

Lottie is useful for fixed decorative clips, such as a passport stamp or loading animation, but I would not use it as the main character system. Lottie primarily plays predefined After Effects animations, whereas our traveler needs connected, runtime-controlled states. [Lottie documentation](https://airbnb.io/lottie)

## What actually creates the premium feeling

The premium result will come mainly from these details:

- A unique illustration style—not generic flat startup artwork.
- Natural animation timing and character weight.
- Hair, jacket and backpack moving after the body.
- Proper ground contact and soft moving shadows.
- Eyes looking at people and nearby objects.
- Facial reactions during conversations.
- Foreground and background parallax.
- Day-to-night lighting transitions.
- Country-specific ambient sound.
- Smooth camera movement when an encounter begins.
- Consistent typography and restrained interface elements.
- Scene transitions that never show loading screens.

For example, when the traveler drinks coffee, he should not simply raise a cup:

## He notices the café.

## Looks at it while continuing to walk. ## Slows down and changes direction. ## Receives the cup. ## Smells the coffee. ## Takes a drink. ## Reacts to its taste. ## Thanks the person. ## Continues walking with the cup briefly.

That secondary acting is what makes 2D feel expensive.

## Reusable character system

We should create approximately 12 foundational animations:

- Walk.
- Idle.
- Notice something.
- Wave.
- Talk.
- Listen.
- Laugh/react.
- Check phone.
- Drink.
- Take photograph.
- Sit/rest.
- Say goodbye.

Props and expressions can be combined with those animations. The “talk” animation can support several moods—curious, surprised, amused and thoughtful—without building a completely new animation for every conversation.

NPCs can also share two or three foundational body rigs with different faces, clothing, hairstyles, ages and accessories. That allows us to create many people without individually animating everyone.

## Dialogue should be content-driven

The spoken text should not be embedded inside the animation. Store each encounter as structured content:

```json
{
    *country*: *Uzbekistan*,
    *npc*: *Plov chef*,
    *location*: *Tashkent*,
    *lines*: [
    { *speaker*: *traveler*, *mood*: *curious*, *text*: *What should I eat here?* },
    { *speaker*: *npc*, *mood*: *surprised*, *text*: *You haven't tried plov?* }
    ],
    *nextAction*: *visit_plov_restaurant*
}
```

This gives us:

- Easy English, Uzbek and Russian localization.
- Different conversations without new animation work.
- Reliable prewritten stories.
- Control over cultural accuracy.
- The ability to connect dialogue to later events.

I would not generate the conversations live with AI in the **MVP**. One strange or culturally insensitive conversation could damage the project. We can prepare the dialogue and use locals from each country to suggest jokes, food and small stories.

## Sponsor integration inside conversations

A sponsor can appear naturally, but no more than one encounter per day should feel explicitly promotional.

For example:

> **Local:** How do you know where you’re going next? > **Traveler:** I don’t. The internet votes—and I use **[sponsored travel app]** to figure out the rest.

The app appears on his phone, followed by a small clearly labeled sponsor **CTA**. His backpack patch remains visible throughout the day, but the product should not be mentioned in every conversation.

So the final answer is: **yes, we can build a genuinely premium product with 2D, including conversations and all these actions.** The technical implementation is realistic. The most important investment will be the original character design, master rig and animation quality—not 3D technology.
