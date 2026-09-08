/**
 * DEVELOPMENT SEED DATA -- run with `npm run db:demo`.
 *
 * Creates a set of demo accounts with deliberately different taste profiles
 * and writes reviews from them, so the taste-match feature can be seen and
 * tested before there are real users.
 *
 * This is NOT launch content. Shipping invented reviews as if real people
 * wrote them would be dishonest, and every account it creates is named
 * `demo_*` with a shared password so it is obvious what they are.
 */
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { migrate, db, Users, Feedback, Reviews, Hubs, Posts } from './db.js';
import { hashPassword } from './auth.js';
import { byId } from './catalog.js';

export const DEMO_PASSWORD = 'demo-account-not-for-production';

/**
 * Demo ids are derived from the username rather than random.
 *
 * On a serverless host every container seeds its own database. With random
 * ids, demo_lorehound got a different id in each container, so a session
 * cookie issued by one container referenced a user that did not exist in the
 * next -- and the visitor was logged out on their next click. Deriving the id
 * makes the seeded identities identical everywhere.
 */
function stableId(seed) {
  const h = createHash('sha256').update(`playstyle-demo:${seed}`).digest('hex');
  // Shape it as a UUID so it matches the format used for real accounts.
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-');
}

const PEOPLE = [
  { username: 'demo_tacticaldad',   loves: ['cs2', 'valorant', 'r6-siege'] },
  { username: 'demo_sprintreload',  loves: ['cod-mw3', 'cod-warzone', 'apex-legends'] },
  { username: 'demo_lorehound',     loves: ['elden-ring', 'dark-souls-3', 'bloodborne'] },
  { username: 'demo_quietfarm',     loves: ['stardew-valley', 'animal-crossing-nh', 'a-short-hike'] },
  { username: 'demo_spreadsheetops',loves: ['factorio', 'rimworld', 'civ-7'] },
  { username: 'demo_couchduo',      loves: ['it-takes-two', 'split-fiction', 'portal-2'] },
  { username: 'demo_nightshift',    loves: ['re4-remake', 'dead-space-remake', 'phasmophobia'] },
  { username: 'demo_storyfirst',    loves: ['rdr2', 'witcher-3', 'disco-elysium'] },
  { username: 'demo_gridline',      loves: ['forza-horizon-5', 'rocket-league', 'gran-turismo-7'] },
  { username: 'demo_raidnight',     loves: ['ffxiv', 'destiny-2', 'monster-hunter-wilds'] },
  { username: 'demo_animeframes',   loves: ['persona-5-royal', 'nier-automata', 'ff7-rebirth'] },
  { username: 'demo_blockbuilder',  loves: ['minecraft', 'terraria', 'valheim'] },
  { username: 'demo_framedata',     loves: ['street-fighter-6', 'tekken-8', 'smash-ultimate'] },
  { username: 'demo_indiepilgrim',  loves: ['hollow-knight', 'celeste', 'outer-wilds'] },
  { username: 'demo_familyroom',    loves: ['mario-odyssey', 'mario-kart-world', 'zelda-totk'] },

  // Real userbases cluster: lots of people share a taste, with variations.
  // Without clusters nobody ever has three close matches on a game, so the
  // "players with your taste" figure could never reach its minimum sample.
  { username: 'demo_ashenone',      loves: ['elden-ring', 'dark-souls-3', 'lies-of-p'] },
  { username: 'demo_parrytimer',    loves: ['sekiro', 'wukong', 'lies-of-p'] },
  { username: 'demo_headglitch',    loves: ['cod-bo6', 'cod-warzone', 'battlefield-2042'] },
  { username: 'demo_ttkdiff',       loves: ['cod-mw3', 'battlefield-1', 'the-finals'] },
  { username: 'demo_slowmorning',   loves: ['stardew-valley', 'coral-island', 'spiritfarer'] },
  { username: 'demo_teatime',       loves: ['animal-crossing-nh', 'a-short-hike', 'unpacking'] },
  { username: 'demo_lastsave',      loves: ['rdr2', 'tlou-2', 'gow-ragnarok'] },
  { username: 'demo_dialoguetree',  loves: ['disco-elysium', 'baldurs-gate-3', 'witcher-3'] },
  { username: 'demo_squadwipe',     loves: ['helldivers-2', 'deep-rock', 'left4dead-2'] },
];

const REVIEWS = [
  ['demo_lorehound', 'elden-ring', 'recommend', 180, "Two hundred hours and I still find caves I have never seen. The bosses are unfair in the way that makes beating them mean something."],
  ['demo_storyfirst', 'elden-ring', 'mixed', 40, "The world is extraordinary but the story is scattered across item descriptions. If you want a narrative that holds your hand, this is not it."],
  ['demo_quietfarm', 'elden-ring', 'avoid', 6, "I wanted to like this. I died to the first horse knight eleven times and stopped having fun. No difficulty options means no way in for me."],
  ['demo_sprintreload', 'elden-ring', 'mixed', 25, "Combat feels great once it clicks, but coming from shooters the pace took me a week to adjust to. Stick with it past the first area."],

  ['demo_sprintreload', 'cod-bo6', 'recommend', 90, "Omnimovement genuinely changes how you take angles. Best gunplay in the series for years and the campaign is not filler this time."],
  ['demo_tacticaldad', 'cod-bo6', 'mixed', 30, "Fun for an hour but the maps reward pre-firing over positioning. If you came from CS you will find the time-to-kill frustrating."],
  ['demo_gridline', 'cod-bo6', 'recommend', 45, "Exactly what I want after work. Drop in, ten minutes, done. Zombies with friends is the real value here."],

  ['demo_tacticaldad', 'valorant', 'recommend', 900, "The only shooter where I can point at every death and say what I did wrong. Abilities never override aim, which is the whole trick."],
  ['demo_sprintreload', 'valorant', 'mixed', 60, "Mechanically superb, socially brutal. Solo queue below Platinum is a coin flip on whether anyone speaks to you like a person."],

  ['demo_raidnight', 'helldivers-2', 'recommend', 220, "The friendly fire is the point. Four people, one objective, and someone always calls the airstrike on the extraction pad."],
  ['demo_couchduo', 'helldivers-2', 'recommend', 55, "Best co-op purchase we have made in years. Genuinely funny without ever writing a joke, because the chaos does it for you."],
  ['demo_tacticaldad', 'helldivers-2', 'mixed', 35, "Great sandbox, weak progression. After the first fifty hours the grind for samples starts showing through the fun."],

  ['demo_quietfarm', 'stardew-valley', 'recommend', 400, "I have played this through four times. It never asks anything of you and somehow that is why I keep coming back."],
  ['demo_spreadsheetops', 'stardew-valley', 'recommend', 130, "Do not let the pixel art fool you, the late-game crop and artisan logistics are a genuine optimisation problem."],
  ['demo_lorehound', 'stardew-valley', 'mixed', 12, "Pleasant, but I need something to push against. The mines gave me a little of that and then ran out."],

  ['demo_spreadsheetops', 'factorio', 'recommend', 1200, "I have lost seasons to this. Nothing else models the feeling of a system you built slowly outgrowing you."],
  ['demo_raidnight', 'factorio', 'recommend', 90, "Same itch as optimising a raid rotation, except the raid is a factory and it never logs off."],
  ['demo_couchduo', 'factorio', 'avoid', 4, "Bounced off hard. Two hours of tutorial and I still could not see what the goal was. Clearly not for me."],

  ['demo_nightshift', 're4-remake', 'recommend', 60, "Three playthroughs and the knife parry still feels incredible. They kept everything that mattered and fixed the tank controls."],
  ['demo_storyfirst', 're4-remake', 'recommend', 20, "I expected schlock and got a genuinely well-paced thriller. Leon is allowed to be funny without the game winking at you."],
  ['demo_quietfarm', 're4-remake', 'avoid', 2, "Far too tense for me, which is my problem and not the game's. It is clearly very good at what it does."],

  ['demo_storyfirst', 'rdr2', 'recommend', 160, "The slowest great game ever made. Give it six hours before you judge the controls; the payoff is the best written cast in the medium."],
  ['demo_sprintreload', 'rdr2', 'mixed', 18, "Gorgeous, but I spend more time watching animations than playing. Beautiful film, mediocre game, depending on what you came for."],
  ['demo_lorehound', 'rdr2', 'recommend', 95, "Arthur's arc is worth the pacing. The world rewards the same slow attention that soulslikes do, just without the combat."],

  ['demo_gridline', 'balatro', 'recommend', 70, "I installed this to kill twenty minutes at an airport and it has been on my phone for eight months."],
  ['demo_spreadsheetops', 'balatro', 'recommend', 140, "It is a build-optimisation game wearing poker as a costume. The jokers interact in ways the tutorial never tells you."],
  ['demo_storyfirst', 'balatro', 'mixed', 15, "Extremely well made and completely without theme or character. Fine for a commute, not something I think about after."],

  ['demo_couchduo', 'split-fiction', 'recommend', 14, "Fourteen hours, two players, and it throws away a brilliant mechanic every twenty minutes. Nobody else is this generous."],
  ['demo_gridline', 'split-fiction', 'recommend', 13, "Played it with my partner who does not play games. She finished it. That is the highest praise I have."],

  ['demo_raidnight', 'expedition-33', 'recommend', 65, "Turn-based with real-time dodges should not work this well. The soundtrack alone justifies the purchase."],
  ['demo_lorehound', 'expedition-33', 'recommend', 58, "The hardest fights ask the same thing soulslikes do: learn the pattern, respect it. Art direction is unreal."],
  ['demo_quietfarm', 'expedition-33', 'mixed', 9, "Beautiful and very sad. I had to stop for a bit. Combat asked more reflex from me than I wanted from a turn-based game."],
  ['demo_animeframes', 'expedition-33', 'recommend', 90, "This is what happens when a small team cares more than a big one. Every character gets a real arc and the score is extraordinary."],

  ['demo_storyfirst', 'cyberpunk-2077', 'recommend', 110, "Night City is the most convincing place in games. Phantom Liberty is better written than most standalone releases."],
  ['demo_sprintreload', 'cyberpunk-2077', 'mixed', 30, "Shooting is fine now, driving still is not. I spent more time in menus building a character than I did enjoying the result."],
  ['demo_lorehound', 'cyberpunk-2077', 'recommend', 75, "Went in for the setting and stayed for the side quests. The Sinnerman questline is braver than anything a bigger studio would ship."],

  ['demo_storyfirst', 'witcher-3', 'recommend', 200, "Still the best side quests ever written. A missing goat turns into a short story and the game never signposts which ones matter."],
  ['demo_quietfarm', 'witcher-3', 'mixed', 20, "Gorgeous and far too grim for me. Gwent is genuinely excellent though and I would play a whole game of just that."],

  ['demo_spreadsheetops', 'baldurs-gate-3', 'recommend', 190, "It says yes to everything. I solved a boss fight by shoving him off a ledge and the game treated that as a legitimate plan."],
  ['demo_animeframes', 'baldurs-gate-3', 'recommend', 140, "Act three drags but the companions carry it. First RPG in years where I cared what my party thought of me."],
  ['demo_sprintreload', 'baldurs-gate-3', 'avoid', 8, "Everyone told me this was the greatest game ever. Eight hours of reading and dice rolls and I have not enjoyed a minute of it."],

  ['demo_blockbuilder', 'minecraft', 'recommend', 2000, "Fourteen years and I still open it when I do not know what else to play. Nothing else lets you just build the thing you pictured."],
  ['demo_familyroom', 'minecraft', 'recommend', 300, "Playing this with my nephew is the only screen time nobody argues about. Creative mode is a genuinely good toy."],
  ['demo_tacticaldad', 'minecraft', 'mixed', 25, "I understand why people love it. Without a goal to work toward I run out of reasons to log in after a week."],

  ['demo_blockbuilder', 'valheim', 'recommend', 240, "Building on hills is a nightmare and I love it anyway. Best base-building physics in any survival game."],
  ['demo_raidnight', 'valheim', 'recommend', 80, "Playing with five people and dividing the labour felt like a small raid guild. Bosses actually need a plan."],

  ['demo_tacticaldad', 'cs2', 'recommend', 3000, "Ten years and the skill ceiling still moves. Every loss is explainable, which is the highest compliment I can pay a competitive game."],
  ['demo_gridline', 'cs2', 'mixed', 40, "Mechanically the best but I do not have the hours it asks for. Rocket League gives me the same tension in five minutes."],
  ['demo_framedata', 'cs2', 'recommend', 200, "Same appeal as a fighting game: tiny inputs, huge consequences. Learning spray patterns is just learning combos."],

  ['demo_framedata', 'street-fighter-6', 'recommend', 500, "Modern controls got three of my friends into fighting games. First time the genre has actually solved its onboarding problem."],
  ['demo_familyroom', 'street-fighter-6', 'recommend', 30, "World Tour mode is a whole single player game and it teaches you without you noticing. Surprised how much we played it."],
  ['demo_tacticaldad', 'street-fighter-6', 'mixed', 18, "Excellent game, wrong hobby for me. Losing in a shooter I can blame positioning, losing here just means I am worse."],

  ['demo_framedata', 'tekken-8', 'recommend', 380, "Heat system rewards pressing forward, which is the right call. Punishment for panic mashing is still brutal though."],

  ['demo_indiepilgrim', 'hollow-knight', 'recommend', 95, "The map is the puzzle. Being lost is the intended experience and the moment it clicks is unmatched."],
  ['demo_lorehound', 'hollow-knight', 'recommend', 70, "Soulslike lessons in two dimensions. Path of Pain broke me and I went back anyway."],
  ['demo_couchduo', 'hollow-knight', 'mixed', 10, "Beautiful, and I gave up at the second boss. It does not meet you halfway even slightly."],

  ['demo_indiepilgrim', 'silksong', 'recommend', 60, "Faster and meaner than the first. If you found Hollow Knight slow this fixes the exact thing you disliked."],

  ['demo_indiepilgrim', 'outer-wilds', 'recommend', 30, "Do not read anything about it. Twenty-two minute loop, one solar system, and the best moment of discovery in games."],
  ['demo_storyfirst', 'outer-wilds', 'recommend', 26, "No combat, no levels, nothing but curiosity. It trusts you completely and that is rare."],
  ['demo_sprintreload', 'outer-wilds', 'avoid', 3, "Flew a ship badly into a planet for an hour and never worked out what I was meant to do. Clearly not for me."],

  ['demo_indiepilgrim', 'celeste', 'recommend', 45, "Hardest thing I have finished and the assist options mean anyone can finish it too. That is good design, not a compromise."],

  ['demo_familyroom', 'zelda-totk', 'recommend', 160, "Every daft plan works. Built a flying machine out of rubbish and the game just let me keep it."],
  ['demo_blockbuilder', 'zelda-totk', 'recommend', 120, "Closest thing to Minecraft's creative freedom in a game with an actual story attached."],
  ['demo_lorehound', 'zelda-totk', 'mixed', 40, "Astonishing sandbox, weightless combat. I wanted the physics toys inside a game that pushed back harder."],

  ['demo_familyroom', 'mario-kart-world', 'recommend', 250, "The only game the whole family plays without a row. Blue shells excepted."],

  ['demo_raidnight', 'ffxiv', 'recommend', 3000, "Only MMO where the story is the reason to subscribe. Free trial is famously absurd and you should take it."],
  ['demo_animeframes', 'ffxiv', 'recommend', 900, "Shadowbringers is better written than most single player RPGs. Getting there takes a while and it is worth it."],

  ['demo_animeframes', 'persona-5-royal', 'recommend', 120, "A hundred hours of school timetables and heists and I never once wanted it to end. The presentation is absurd."],
  ['demo_quietfarm', 'persona-5-royal', 'recommend', 80, "Unexpected favourite. Half of it is a calm life sim about making friends, which is exactly what I wanted."],

  ['demo_gridline', 'rocket-league', 'recommend', 1400, "Car football. Explains itself in ten seconds, takes a decade to master, still the best game to watch."],
  ['demo_tacticaldad', 'rocket-league', 'recommend', 200, "Same read-and-react loop as a tactical shooter with none of the aim. My whole group plays it."],

  ['demo_gridline', 'forza-horizon-5', 'recommend', 300, "Put a podcast on and drive across Mexico. Most relaxing thing I own and the races are optional."],

  ['demo_nightshift', 'lethal-company', 'recommend', 70, "Cheap, ugly and the funniest thing I have played with friends. Proximity chat does all the work."],
  ['demo_couchduo', 'lethal-company', 'recommend', 40, "We are not a horror household and we play this constantly. The comedy defuses it."],

  ['demo_sprintreload', 'marvel-rivals', 'recommend', 120, "Destructible maps change how you take fights. Feels like Overwatch before it got solved."],
  ['demo_familyroom', 'marvel-rivals', 'mixed', 20, "Fun with recognisable characters, but the ranked climb turned my friends unpleasant. Casual only for us."],

  ['demo_raidnight', 'monster-hunter-wilds', 'recommend', 400, "Learn one monster for forty hours, then wear it. Nothing else rewards patience like this."],
  ['demo_lorehound', 'monster-hunter-wilds', 'recommend', 120, "Same satisfaction as a soulslike boss, except the boss has a schedule and a home."],

  ['demo_blockbuilder', 'terraria', 'recommend', 600, "More content than games costing five times as much. The bosses are the part people underestimate."],

  ['demo_nightshift', 'subnautica', 'recommend', 55, "Genuine fear of open water turned into wonder. Play it without looking anything up."],
  ['demo_indiepilgrim', 'subnautica', 'recommend', 40, "Exploration doing all the heavy lifting, no combat needed. The story is better than it has any right to be."],

  ['demo_spreadsheetops', 'civ-7', 'recommend', 320, "One more turn, every time. The age transitions are divisive but they fix the boring late game."],
  ['demo_raidnight', 'civ-7', 'mixed', 45, "Enjoyable but I miss the old continuity. Restarting my empire mid-game undercuts the fantasy for me."],

  ['demo_spreadsheetops', 'rimworld', 'recommend', 900, "A story generator wearing a colony sim as a coat. Everything that goes wrong becomes an anecdote."],

  ['demo_gridline', 'ea-fc-25', 'mixed', 180, "On the pitch it is the best football has felt in years. Ultimate Team is a shop with a game attached."],
  ['demo_framedata', 'ea-fc-25', 'avoid', 25, "Yearly release, same bugs, more currency. Play it at a friend's house and save your money."],

  ['demo_storyfirst', 'gow-ragnarok', 'recommend', 55, "Blockbuster spectacle that actually earns its emotional beats. The axe still feels perfect."],
  ['demo_animeframes', 'gow-ragnarok', 'mixed', 30, "Superb production, very slow. I wanted to be trusted to walk through a gap without a conversation about it."],

  ['demo_nightshift', 'dead-by-daylight', 'recommend', 700, "Eight years in and the licensed crossovers are still absurd in the best way. Learn one killer properly."],

  ['demo_couchduo', 'portal-2', 'recommend', 12, "Perfect pacing, perfect jokes, and the co-op campaign is a separate gift. Nobody dislikes this."],
  ['demo_familyroom', 'portal-2', 'recommend', 9, "Played it with my kid solving alternate rooms. Best introduction to puzzle games there is."],

  // Cluster reviews on the games most likely to be opened in a demo, so the
  // taste-matched aggregate has a real sample to work from.
  ['demo_ashenone', 'elden-ring', 'recommend', 240, "Third playthrough and I am still finding catacombs. The freedom to walk away from a wall you cannot beat is the whole design."],
  ['demo_parrytimer', 'elden-ring', 'recommend', 130, "Weakest combat of the modern FromSoft games and still better than everything else. Shame the parry timing is so forgiving after Sekiro."],
  ['demo_ashenone', 'lies-of-p', 'recommend', 60, "Best non-FromSoft soulslike by a distance. The weapon assembly system should be stolen by everyone."],
  ['demo_parrytimer', 'lies-of-p', 'recommend', 72, "Perfect guard is Sekiro's deflect with a longer window. If Sekiro's rhythm clicked for you this will too."],
  ['demo_ashenone', 'wukong', 'mixed', 45, "Spectacular bosses, forgettable everything between them. Worth it for the fights alone but the traversal is a chore."],
  ['demo_parrytimer', 'dark-souls-3', 'recommend', 190, "The one I go back to. Tight, linear, no filler, and the DLC bosses are the best in the series."],
  ['demo_ashenone', 'hollow-knight', 'recommend', 80, "Soulslike structure that respects your time. Charm builds are the closest 2D has come to real build variety."],

  ['demo_headglitch', 'cod-bo6', 'recommend', 210, "Omnimovement is the biggest change in a decade. Diving out of a corner should not work as well as it does."],
  ['demo_ttkdiff', 'cod-bo6', 'recommend', 95, "Maps finally have three real lanes again. Best the series has felt since the old Black Ops games."],
  ['demo_headglitch', 'cod-warzone', 'mixed', 400, "Still the best gunplay in a battle royale and still the buggiest. I keep coming back and I keep regretting it."],
  ['demo_ttkdiff', 'battlefield-2042', 'mixed', 140, "Two years of patches got it to fine. Fine is not what Battlefield used to be, but the vehicle play is back."],
  ['demo_headglitch', 'battlefield-2042', 'recommend', 180, "Now that specialists are gone it plays like Battlefield again. 128 players is chaos and I am here for it."],
  ['demo_ttkdiff', 'the-finals', 'recommend', 130, "Destruction is not a gimmick, it is the whole tactical layer. Bring down the floor and the fight is over."],
  ['demo_headglitch', 'cs2', 'mixed', 60, "I respect it and I cannot play it. Coming from CoD the movement feels like wading through wet sand."],

  ['demo_slowmorning', 'stardew-valley', 'recommend', 700, "Six saves and counting. The only game where I have deliberately played slower to make it last."],
  ['demo_teatime', 'stardew-valley', 'recommend', 210, "Perfect twenty-minutes-before-bed game. The fishing minigame is the only cruel thing in it."],
  ['demo_slowmorning', 'coral-island', 'recommend', 160, "Stardew with better art and a reef to restore. Diving is a genuinely lovely addition."],
  ['demo_teatime', 'a-short-hike', 'recommend', 3, "Ninety minutes, no stress, and I think about it more than games that took me ninety hours."],
  ['demo_slowmorning', 'spiritfarer', 'recommend', 40, "A cosy game about dying that earns every tear. The boat becoming home is the whole trick."],
  ['demo_teatime', 'animal-crossing-nh', 'recommend', 420, "Still open it daily. Nothing is urgent and that is precisely the appeal."],
  ['demo_slowmorning', 'dave-the-diver', 'recommend', 55, "Should not work. Diving, then running a restaurant, then somehow a farming section. Delightful."],
  ['demo_teatime', 'unpacking', 'recommend', 5, "You learn a whole life from where someone puts their mugs. Quietly devastating."],
  ['demo_slowmorning', 'minecraft', 'recommend', 380, "Creative mode is the best digital dollhouse ever made. I have never once fought the dragon."],

  ['demo_lastsave', 'rdr2', 'recommend', 190, "The slowest great game ever made and I would not change a frame of it. Arthur's last chapter is unmatched."],
  ['demo_dialoguetree', 'rdr2', 'recommend', 120, "Best written cast in the medium, and it lets you be complicit rather than heroic. Rare thing."],
  ['demo_lastsave', 'tlou-2', 'recommend', 60, "Deliberately unpleasant and completely in control of what it is doing. Not a game I will replay, and that is fine."],
  ['demo_dialoguetree', 'baldurs-gate-3', 'recommend', 260, "It says yes to plans that should not work. I have never felt so little friction between an idea and doing it."],
  ['demo_lastsave', 'gow-ragnarok', 'recommend', 48, "Spectacle that earns its quiet moments. The axe recall is still the best-feeling input in games."],
  ['demo_dialoguetree', 'disco-elysium', 'recommend', 70, "The best prose in any game. You investigate a murder and mostly investigate yourself."],
  ['demo_dialoguetree', 'cyberpunk-2077', 'recommend', 130, "Phantom Liberty is a genuinely great spy thriller. Night City finally has a story worth its detail."],
  ['demo_lastsave', 'cyberpunk-2077', 'mixed', 55, "Beautiful, and the main quest is in a hurry while telling you not to be. The side stories are the real game."],

  ['demo_squadwipe', 'helldivers-2', 'recommend', 340, "Four players, one objective, and the friendly fire is the punchline every single time. Nothing else is this funny by accident."],
  ['demo_squadwipe', 'deep-rock', 'recommend', 260, "Rock and stone. Best co-op design going: four classes that genuinely need each other."],
  ['demo_squadwipe', 'left4dead-2', 'recommend', 500, "Sixteen years old and the AI director still paces a horde better than anything since."],
  ['demo_squadwipe', 'lethal-company', 'recommend', 90, "Proximity chat does the comedy for free. We have never once completed a full quota calmly."],
];

/** [author, franchise, title, body, [ [commenter, comment], ... ] ] */
const POSTS = [
  ['demo_sprintreload', 'call-of-duty',
   'Omnimovement has completely changed how I hold angles',
   "Six months in and I still find new spots. Sliding into a corner then diving out of it beats every jiggle-peek I used to rely on. Anyone else basically stopped strafing?",
   [['demo_tacticaldad', "It rewards movement over positioning, which is exactly why I bounced off it. Different game to what I want, not a worse one."],
    ['demo_gridline', 'Took me a week to stop diving into walls. Worth it.']]],
  ['demo_tacticaldad', 'call-of-duty',
   'Coming from CS2, what is the shortest path to being useful?',
   "My aim is fine but I keep dying to people who saw me first. Assuming that means I am playing the map wrong rather than shooting wrong. Where do I start?",
   [['demo_sprintreload', "Stop holding angles. In CS you hold, here you move. Learn the three lanes on each map and rotate before the spawn flips."]]],
  ['demo_lorehound', 'soulsborne',
   'Ranking the four on how well they teach you their combat',
   "Sekiro is the clearest: deflect or die, learned in one boss. Bloodborne teaches aggression by taking away your shield. Dark Souls III assumes you already know. Elden Ring lets you skip learning entirely by summoning, which is either its best or worst feature.",
   [['demo_storyfirst', 'Elden Ring letting you walk away from a wall is the reason I finished a FromSoft game at all.'],
    ['demo_quietfarm', "This thread is the first time any of this sounded appealing rather than punishing. Might try Sekiro."]]],
  ['demo_quietfarm', 'stardew',
   'Year 4 and I have stopped optimising, best decision I made',
   "Spent three saves chasing perfect crop layouts and burnt out every time. This run I planted whatever looked nice and actually finished the community centre. Turns out the game is better when you let it be slow.",
   [['demo_spreadsheetops', 'Respectfully, the artisan pipeline is the fun part for me. Different games in the same box.'],
    ['demo_couchduo', 'Co-op with someone who plays like this is very relaxing. Recommend it.']]],
  ['demo_spreadsheetops', 'factorio',
   'The main bus was a trap and I should have gone train-first',
   "Every megabase I build hits the same wall around blue science. The bus becomes a spaghetti junction I am afraid to touch. Started over with city blocks and trains and it is night and day.",
   [['demo_raidnight', 'Same realisation. Trains scale, buses do not. The tutorial should say this.']]],
  ['demo_nightshift', 'resident-evil',
   'RE4 remake vs Village: which one should a horror sceptic start with?',
   "Have a friend who does not do horror but likes shooters. Leaning RE4 because the action carries it and the tone is silly enough to defuse the tension. Village front-loads its scariest section.",
   [['demo_storyfirst', 'RE4. The tone tells you it is fine to laugh, which makes the scares land better anyway.'],
    ['demo_quietfarm', 'Speaking as the horror sceptic in most groups: neither, but RE4 if forced.']]],
  ['demo_couchduo', 'hazelight',
   'We finished Split Fiction in two sittings and immediately wanted more',
   "Nothing else designs for two people this deliberately. Every mechanic gets introduced, used properly, then thrown away before it wears out. My partner does not play games and finished it with me.",
   [['demo_gridline', 'Same experience. It Takes Two then this, both worked on people who never touch a controller.']]],
  ['demo_raidnight', 'destiny',
   'Is the sci-fi gunfeel still the best in the genre, or is that nostalgia?',
   "Came back after two years off. Mechanically it still feels better than anything else I have shot in, but the amount of menu I have to read before I can play has doubled.",
   [['demo_sprintreload', 'Gunfeel yes. Onboarding, absolutely not. I could not work out what to press.']]],
  ['demo_gridline', 'forza',
   'Best use of this game is not racing at all',
   "Put on a podcast, set a long drive across the map, and it is the most relaxing thing on my console. The actual races are fine but the driving is the point.",
   [['demo_quietfarm', 'This is the only racing game I have ever enjoyed and it is entirely for this reason.']]],
  ['demo_storyfirst', 'red-dead',
   'The first six hours are a filter and I think that is on purpose',
   "Everyone who quits, quits in the snow. The game is deliberately teaching you to slow down before it gives you the open world. Frustrating design, effective design.",
   [['demo_lorehound', 'Same trick as a soulslike tutorial boss. Teach the pace or lose the player.'],
    ['demo_sprintreload', 'Or it is just slow and we are making excuses for it. Still finished it though.']]],

  ['demo_tacticaldad', 'valorant',
   'Stop buying on force rounds, you are losing the next one too',
   "Watched twenty of my own demos back. Nearly every loss streak starts with a force buy that half-works, then two rounds with no shields. Save properly and the round after is winnable.",
   [['demo_sprintreload', 'This is the single hardest habit to unlearn coming from respawn shooters.'],
    ['demo_framedata', 'Same as burning meter on a bad read. Patience is a mechanic.']]],
  ['demo_blockbuilder', 'minecraft',
   'Fourteen years in and I still cannot finish a base',
   "Every world starts with a dirt hut I swear is temporary, and ends with a dirt hut surrounded by half-built stone. Does anyone actually complete the thing they sketched?",
   [['demo_familyroom', 'My nephew finishes his. I have never finished one. I think it is a patience thing.'],
    ['demo_spreadsheetops', 'I finish them by treating it as a logistics problem first and decoration never.'],
    ['demo_indiepilgrim', 'The dirt hut is the real game and the stone castle is the lie we tell ourselves.']]],
  ['demo_indiepilgrim', 'hollow-knight',
   'Silksong made me appreciate how slow the first game deliberately was',
   "Going back to Hallownest after Silksong, the pacing is completely different. The original wants you lost and uncertain. The sequel assumes you already know how to be lost.",
   [['demo_lorehound', 'Same relationship as Dark Souls to Sekiro. One teaches caution, the other teaches aggression.']]],
  ['demo_animeframes', 'final-fantasy',
   'Where should someone start in 2026? Genuine question',
   "Every recommendation thread says a different entry. XIV needs a subscription, VII Rebirth needs the first remake, and the older ones look their age. What do you tell a newcomer?",
   [['demo_raidnight', 'XIV free trial. It is a running joke because it is genuinely the right answer.'],
    ['demo_storyfirst', 'Rebirth if you want the best version of the combat. The plot will confuse you and that is fine.']]],
  ['demo_framedata', 'street-fighter',
   'Modern controls are not cheating and this argument is exhausting',
   "Three of my friends play fighting games now because of one control scheme. The skill ceiling did not move. Anyone still angry about this is arguing for a smaller hobby.",
   [['demo_familyroom', 'Only reason my household plays it. Would never have got past the training mode otherwise.'],
    ['demo_tacticaldad', 'Agreed, and I say that as someone who is bad at this game with either scheme.']]],
  ['demo_nightshift', 'silent-hill',
   'The remake understood that the fog was never a technical limitation',
   "Twenty years of people saying the fog was to hide draw distance. The remake keeps it with hardware that does not need it, because the point was always that you cannot see what is coming.",
   [['demo_storyfirst', 'Same with the tank controls being replaced. Keep the intent, drop the constraint.']]],
  ['demo_gridline', 'rocket-league',
   'Ranked plateau at Diamond and I think the problem is my rotation',
   "Aerials are fine, first touch is fine, but I am constantly the second man ball-chasing. Any drills that actually fixed this for people rather than just telling me to rotate?",
   [['demo_tacticaldad', 'Play a few matches where you are not allowed to touch the ball first. Uncomfortable, works.'],
    ['demo_framedata', 'Record yourself. You will hate it and then you will fix it in a week.']]],
  ['demo_spreadsheetops', 'civilization',
   'Age transitions are the best change and everyone is furious about it',
   "The late game was always a formality once you were ahead. Resetting the board keeps the interesting decisions coming right to the end. I understand the anger but I think it is nostalgia.",
   [['demo_raidnight', 'I am the nostalgia. I want my empire to persist even if the game is worse for it.']]],
  ['demo_quietfarm', 'animal-crossing',
   'Five years on and I still open it for ten minutes a day',
   "No goals, no failure, no pressure. I water some flowers and talk to a duck. It is the only game I have never once felt obliged to play.",
   [['demo_familyroom', 'Ours is a shared island and it has survived three house moves.'],
    ['demo_indiepilgrim', 'This is the thing Stardew fans should try when Stardew starts feeling like a job.']]],
  ['demo_couchduo', 'portal',
   'Best two-player game to hand someone who does not play games',
   "Tried this with three different non-gamer friends. All three finished the co-op campaign. The puzzles teach themselves and nobody has to be good at anything mechanical.",
   [['demo_familyroom', 'Confirmed. Also the only co-op game where being stuck is fun rather than tense.']]],
  ['demo_raidnight', 'monster-hunter',
   'Wilds finally made the early game not a chore',
   "Every previous entry asked you to fight three boring monsters before it showed you what the series is. Wilds gets you to a real hunt inside an hour and I think that is why it stuck for so many people.",
   [['demo_lorehound', 'Agreed, though I slightly miss earning the good weapons rather than being handed a set.']]],
  ['demo_lorehound', 'soulsborne',
   'Boss order in Elden Ring is the real difficulty setting',
   "Half the people who bounce off it walked into Margit at level nine. The open world means the game will happily let you attempt content four hours too early and never tell you.",
   [['demo_quietfarm', 'This is genuinely useful. Nobody explained that to me the first time.'],
    ['demo_sprintreload', 'Wish the game said this. I assumed I was bad rather than early.']]],
  ['demo_storyfirst', 'cyberpunk',
   'Phantom Liberty is better written than most standalone releases',
   "The Songbird ending sequence is the strongest thing CDPR has written including anything in Witcher 3. It took three years and a spy thriller to get there but it arrived.",
   [['demo_lorehound', 'The Sinnerman quest in the base game is still the braver piece of writing for my money.']]],
  ['demo_blockbuilder', 'terraria',
   'People sleep on this because it looks like a Minecraft clone',
   "It has better bosses, better progression and more content than almost anything at its price. The 2D art is the only reason it gets dismissed and that is a shame.",
   [['demo_indiepilgrim', 'Boss rush at the end is a genuinely great action game hiding inside a sandbox.']]],
  ['demo_sprintreload', 'battlefield',
   'BF1 still looks and sounds better than everything after it',
   "Went back last week. The mud, the weather, the way a shell landing shuts down all other sound. Nothing since has matched the atmosphere even with better hardware.",
   [['demo_tacticaldad', 'Sound design is doing most of it. Best in the genre, still.'],
    ['demo_gridline', 'Behemoths were a terrible idea and I miss them enormously.']]],
];

export async function seedDemoData({ quiet = false } = {}) {
  migrate();
  const log = quiet ? () => {} : console.log;

  const missing = REVIEWS.filter(([, gameId]) => !byId.has(gameId)).map(([, g]) => g);
  if (missing.length) throw new Error(`demo reviews reference unknown games: ${[...new Set(missing)].join(', ')}`);

  const password_hash = await hashPassword(DEMO_PASSWORD);
  const ids = new Map();

  const seedPeople = db.transaction(() => {
    for (const person of PEOPLE) {
      const existing = Users.byUsername(person.username);
      const id = existing?.id ?? stableId(person.username);
      if (!existing) {
        Users.create({
          id, email: `${person.username}@demo.playstyle.local`,
          username: person.username, password_hash, created_at: Date.now(),
        });
      }
      ids.set(person.username, id);
      const bad = person.loves.filter((g) => !byId.has(g));
      if (bad.length) throw new Error(`${person.username} loves unknown games: ${bad.join(', ')}`);
      Feedback.setMany(id, person.loves.map((gameId) => ({ gameId, signal: 'love' })), Date.now());
      Users.markOnboarded(id);
    }
  });
  seedPeople();

  const seedReviews = db.transaction(() => {
    for (const [username, game_id, verdict, hours, body] of REVIEWS) {
      const user_id = ids.get(username);
      if (!user_id) throw new Error(`review by unknown demo user: ${username}`);
      const existing = Reviews.mine(user_id, game_id);
      const now = Date.now();
      Reviews.upsert({
        id: existing?.id ?? stableId(`review:${username}:${game_id}`),
        user_id, game_id, verdict, body, hours,
        created_at: existing?.created_at ?? now, updated_at: now,
      });
    }
  });
  seedReviews();

  // Fandom hub posts and comments.
  const seedHubs = db.transaction(() => {
    for (const [author, franchise, title, body, comments] of POSTS) {
      const user_id = ids.get(author);
      if (!user_id) throw new Error(`post by unknown demo user: ${author}`);
      // Idempotent: skip if this author already posted this title here.
      const already = Posts.forHub(franchise).find((p) => p.title === title);
      const now = Date.now();
      const postId = already?.id ?? stableId(`post:${author}:${franchise}:${title}`);
      if (!already) {
        Posts.create({ id: postId, franchise, user_id, title, body, created_at: now, updated_at: now });
      }
      Hubs.join(franchise, user_id, now);

      const existing = new Set(Posts.comments(postId).map((c) => c.body));
      for (const [commenter, text] of comments ?? []) {
        const cid = ids.get(commenter);
        if (!cid) throw new Error(`comment by unknown demo user: ${commenter}`);
        if (!existing.has(text)) {
          Posts.addComment({
            id: stableId(`comment:${commenter}:${postId}:${text.slice(0, 40)}`),
            post_id: postId, user_id: cid, body: text, created_at: Date.now(),
          });
        }
        Hubs.join(franchise, cid, Date.now());
      }
      // Derived, not random: two containers must agree on the vote counts or
      // the same page shows different numbers depending on who serves it.
      for (const [name, other] of ids) {
        if (other === user_id) continue;
        const draw = parseInt(createHash('sha256').update(`vote:${name}:${postId}`).digest('hex').slice(0, 4), 16);
        if (draw % 100 < 45) Posts.vote(postId, other);
      }
    }
  });
  seedHubs();

  const games = new Set(REVIEWS.map(([, g]) => g));
  const hubSlugs = new Set(POSTS.map(([, f]) => f));
  log(`Demo data ready: ${PEOPLE.length} accounts, ${REVIEWS.length} reviews across ${games.size} games,`
    + ` ${POSTS.length} hub posts across ${hubSlugs.size} fandoms.`);
  log(`Sign in as any of them with password: ${DEMO_PASSWORD}`);
  log('Games with reviews:', [...games].join(', '));
  return { accounts: PEOPLE.length, reviews: REVIEWS.length, posts: POSTS.length };
}

// Only run as a CLI when invoked directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedDemoData().catch((err) => { console.error(err.message); process.exit(1); });
}
