/**
 * Demo content: reviewer personas, their reviews, and hub discussions.
 *
 * NOT RUNNABLE AS-IS. It was written for a database the app could write to
 * directly. Now that identity is Supabase Auth and RLS scopes every write to
 * auth.uid(), seeding means creating each persona as a real Supabase account
 * and writing their content as themselves.
 *
 * The data below is kept because it is hand-written and worth reusing; the
 * seeder that consumes it still needs building.
 */
import { createHash } from 'node:crypto';
import { byId } from './catalog.js';

export const DEMO_PASSWORD = 'demo-account-not-for-production';

/** A key cannot appear twice in one multi-row insert. Keeps the first. */
const dedupeBy = (rows, key) => {
  const seen = new Set();
  return rows.filter((r) => {
    const k = key(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Demo ids are derived from the username rather than random.
 *
 * On a serverless host every container seeds its own database. With random
 * ids, demo_lorehound got a different id in each container, so a session
 * cookie issued by one container referenced a user that did not exist in the
 * next -- and the visitor was logged out on their next click. Deriving the id
 * makes the seeded identities identical everywhere.
 */
export function stableId(seed) {
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

  // Every taste needs at least three people in it, or the "players with your
  // taste" figure can never reach its minimum sample and only ever appeared
  // on one game.
  { username: 'demo_turnorder',     loves: ['civ-7', 'xcom-2', 'total-war-warhammer-3'] },
  { username: 'demo_gridcontrol',   loves: ['factorio', 'rimworld', 'stellaris'] },
  { username: 'demo_dreadpitch',    loves: ['silent-hill-2-remake', 'dead-space-remake', 're-village'] },
  { username: 'demo_lastlight',     loves: ['re4-remake', 'alan-wake-2', 'phasmophobia'] },
  { username: 'demo_pitwall',       loves: ['gran-turismo-7', 'assetto-corsa-evo', 'forza-horizon-5'] },
  { username: 'demo_apexline',      loves: ['rocket-league', 'ea-fc-25', 'nba-2k25'] },
  { username: 'demo_limitbreak',    loves: ['ff7-rebirth', 'persona-5-royal', 'expedition-33'] },
  { username: 'demo_aeriths',       loves: ['nier-automata', 'ffxiv', 'ff7-rebirth'] },
  { username: 'demo_redstoner',     loves: ['minecraft', 'terraria', 'palworld'] },
  { username: 'demo_voxelkid',      loves: ['minecraft', 'roblox', 'lego-fortnite'] },
  { username: 'demo_wakeupdp',      loves: ['tekken-8', 'street-fighter-6', 'mk1'] },
  { username: 'demo_throwloop',     loves: ['street-fighter-6', 'smash-ultimate', 'tekken-8'] },
  { username: 'demo_quietcredits',  loves: ['celeste', 'outer-wilds', 'undertale'] },
  { username: 'demo_deducer',       loves: ['obra-dinn', 'blue-prince', 'chants-of-sennaar'] },
  { username: 'demo_sofaplayer',    loves: ['mario-odyssey', 'astro-bot', 'portal-2'] },
  { username: 'demo_twocontrollers',loves: ['mario-kart-world', 'smash-ultimate', 'it-takes-two'] },
  { username: 'demo_tankmain',      loves: ['wow', 'ffxiv', 'destiny-2'] },
  { username: 'demo_hordeclear',    loves: ['monster-hunter-wilds', 'warframe', 'deep-rock'] },

  // Three members is not enough if one of them sits below the match floor.
  // These tighten the indie, fighting and JRPG clusters so three reviewers
  // actually clear it.
  { username: 'demo_pogosticker',   loves: ['hollow-knight', 'celeste', 'dead-cells'] },
  { username: 'demo_nomapneeded',   loves: ['outer-wilds', 'hollow-knight', 'celeste'] },
  { username: 'demo_okizeme',       loves: ['tekken-8', 'street-fighter-6', 'smash-ultimate'] },
  { username: 'demo_meterburn',     loves: ['street-fighter-6', 'tekken-8', 'mk1'] },
  { username: 'demo_materia',       loves: ['persona-5-royal', 'ff7-rebirth', 'nier-automata'] },
  { username: 'demo_summonurn',     loves: ['ff7-rebirth', 'expedition-33', 'persona-5-royal'] },
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

  // --- strategy ---
  ['demo_turnorder', 'civ-7', 'recommend', 410, "Age transitions finally fix the dead late game. One more turn, every single night."],
  ['demo_gridcontrol', 'civ-7', 'mixed', 120, "Solid, but I preferred managing one empire the whole way through rather than three acts."],
  ['demo_spreadsheetops', 'xcom-2', 'recommend', 300, "Ninety-five percent means nothing and you will name every soldier anyway. Tension is unmatched."],
  ['demo_turnorder', 'xcom-2', 'recommend', 260, "The campaign timer is the real enemy. Losing a veteran hurts more than losing a mission."],
  ['demo_gridcontrol', 'xcom-2', 'recommend', 180, "Best turn-based tactics ever made. The mod scene keeps it alive years later."],
  ['demo_turnorder', 'total-war-warhammer-3', 'recommend', 520, "Turn-based empire building plus thousands of models colliding. Nothing else scratches this."],
  ['demo_gridcontrol', 'total-war-warhammer-3', 'mixed', 140, "Magnificent battles, exhausting campaign map. I stopped finishing runs."],
  ['demo_gridcontrol', 'factorio', 'recommend', 1400, "The factory must grow. I dream in belt layouts and I am not exaggerating."],
  ['demo_turnorder', 'factorio', 'recommend', 220, "Same brain as a 4X opening, except the opening never ends. Genuinely dangerous."],
  ['demo_gridcontrol', 'rimworld', 'recommend', 1100, "A story generator wearing a colony sim. My best runs are the ones that collapsed."],
  ['demo_turnorder', 'rimworld', 'recommend', 190, "Emergent narrative done properly. Nothing scripted has ever hit as hard as losing Hana."],
  ['demo_gridcontrol', 'stellaris', 'recommend', 700, "Build a galactic empire, meet something worse on the rim. The mid-game crises carry it."],
  ['demo_spreadsheetops', 'stellaris', 'mixed', 210, "Brilliant for eighty hours then the late game turns into a spreadsheet I stop enjoying."],
  ['demo_turnorder', 'aoe-4', 'recommend', 150, "Classic RTS done right and the documentary campaigns are genuinely worth watching."],
  ['demo_spreadsheetops', 'cities-skylines-2', 'mixed', 130, "Traffic management as a lifestyle. Performance still bites on big cities."],

  // --- horror ---
  ['demo_dreadpitch', 're4-remake', 'recommend', 90, "The knife parry never stops feeling incredible. Best remake anyone has made."],
  ['demo_lastlight', 're4-remake', 'recommend', 120, "Four playthroughs. Tone is silly enough to breathe between the genuinely tense bits."],
  ['demo_dreadpitch', 'silent-hill-2-remake', 'recommend', 40, "They understood the fog was never a technical limit. Heavy in exactly the right way."],
  ['demo_lastlight', 'silent-hill-2-remake', 'recommend', 35, "Psychological horror about grief, handled with care. Not a game I will replay soon."],
  ['demo_nightshift', 'silent-hill-2-remake', 'recommend', 55, "Faithful where it counts and modernised where it had to be. James is still James."],
  ['demo_dreadpitch', 'dead-space-remake', 'recommend', 60, "Sound design will make you check behind you. Still the high point of sci-fi horror."],
  ['demo_lastlight', 'dead-space-remake', 'recommend', 45, "The Ishimura as one continuous space was the right call. Claustrophobic throughout."],
  ['demo_nightshift', 're-village', 'recommend', 70, "Four different horror styles in one game and somehow all four land."],
  ['demo_dreadpitch', 're-village', 'mixed', 30, "Front-loads its best section. The back half turns into an action game I liked less."],
  ['demo_lastlight', 'alan-wake-2', 'recommend', 50, "A survival horror art film. The musical level is the most audacious thing in years."],
  ['demo_dreadpitch', 'alan-wake-2', 'recommend', 42, "Genuinely unlike anything else. Slow, strange and completely in control of itself."],
  ['demo_lastlight', 'phasmophobia', 'recommend', 200, "Half detective work, half everyone screaming. Best with four people and bad nerves."],
  ['demo_dreadpitch', 'dead-by-daylight', 'mixed', 300, "Great chases, rough onboarding. Learn one killer properly or bounce off entirely."],

  // --- racing and sports ---
  ['demo_pitwall', 'gran-turismo-7', 'recommend', 400, "A love letter to car culture. The physics reward patience over aggression, always."],
  ['demo_apexline', 'gran-turismo-7', 'mixed', 60, "Beautiful and far too serious for me. I want arcade chaos, this wants a racing line."],
  ['demo_pitwall', 'forza-horizon-5', 'recommend', 260, "Put a podcast on and drive across Mexico. Most relaxing thing I own."],
  ['demo_apexline', 'forza-horizon-5', 'recommend', 130, "Handles well enough for sim fans and forgiving enough for everyone else. Rare balance."],
  ['demo_pitwall', 'assetto-corsa-evo', 'recommend', 600, "The sim racer's sim racer. Bring a wheel or genuinely do not bother."],
  ['demo_apexline', 'rocket-league', 'recommend', 1100, "Car football. Ten seconds to understand, a decade to master, perfect to watch."],
  ['demo_pitwall', 'rocket-league', 'recommend', 340, "The only esport I can follow without knowing anything. Physics does the storytelling."],
  ['demo_apexline', 'ea-fc-25', 'mixed', 220, "Best football has felt on the pitch in years, attached to a shop I resent."],
  ['demo_pitwall', 'ea-fc-25', 'avoid', 40, "Same bugs, more currency, every year. Play it at a friend's house."],
  ['demo_apexline', 'nba-2k25', 'mixed', 180, "Superb on the court, aggressive everywhere else. MyCareer is a second job."],
  ['demo_gridline', 'mario-kart-world', 'recommend', 90, "Only racing game my whole family will play. Blue shells still end friendships."],

  // --- jrpg and anime ---
  ['demo_limitbreak', 'persona-5-royal', 'recommend', 140, "A hundred hours of timetables and heists and I never wanted it to end."],
  ['demo_aeriths', 'persona-5-royal', 'recommend', 110, "Style so confident it becomes substance. Royal's extra term earns itself."],
  ['demo_limitbreak', 'ff7-rebirth', 'recommend', 130, "Enormous, messy, sincere. The combat system is the best the series has had."],
  ['demo_aeriths', 'ff7-rebirth', 'recommend', 160, "Twenty years of expectation and it mostly delivers. The ending will divide people."],
  ['demo_animeframes', 'nier-automata', 'recommend', 80, "Play to the real ending. It uses the medium in ways nothing else does."],
  ['demo_aeriths', 'nier-automata', 'recommend', 95, "The soundtrack alone would justify it. Route C is where it becomes something else."],
  ['demo_limitbreak', 'nier-automata', 'mixed', 40, "Astonishing writing wrapped in open-world padding I could have done without."],
  ['demo_limitbreak', 'expedition-33', 'recommend', 85, "Turn-based with real-time dodges should not work this well. Art direction stops you dead."],
  ['demo_aeriths', 'expedition-33', 'recommend', 70, "A small team caring more than a big one. Every character gets a real arc."],
  ['demo_aeriths', 'ffxiv', 'recommend', 2400, "Only MMO where the story is the reason to subscribe. Take the free trial."],
  ['demo_limitbreak', 'pokemon-sv', 'mixed', 90, "Technically rough, genuinely fun. Open-world Pokemon is clearly the right direction."],

  // --- sandbox ---
  ['demo_redstoner', 'minecraft', 'recommend', 3000, "Fifteen years and I still open it when nothing else appeals. Redstone is a career."],
  ['demo_voxelkid', 'minecraft', 'recommend', 900, "Nothing else lets you just build the thing you pictured. Creative mode is a great toy."],
  ['demo_redstoner', 'terraria', 'recommend', 800, "Better bosses and better progression than the game it gets compared to. Underrated."],
  ['demo_voxelkid', 'terraria', 'mixed', 60, "Loved the building, bounced off the bosses. Harder than it looks from screenshots."],
  ['demo_redstoner', 'palworld', 'recommend', 220, "Creature collecting plus factory automation plus guns. Should not work, does."],
  ['demo_blockbuilder', 'palworld', 'mixed', 90, "Great first fifty hours, thin after that. The base automation is the real hook."],
  ['demo_voxelkid', 'roblox', 'recommend', 1200, "A platform more than a game. Half of what I play with friends lives here."],
  ['demo_redstoner', 'valheim', 'recommend', 300, "Building on hills is a nightmare and I love it. Best survival building physics."],
  ['demo_voxelkid', 'lego-fortnite', 'recommend', 140, "A surprisingly complete survival game bolted onto Fortnite. Free, which helps."],
  ['demo_redstoner', 'subnautica', 'recommend', 70, "Fear of open water turned into wonder. Do not look anything up beforehand."],

  // --- fighting ---
  ['demo_wakeupdp', 'street-fighter-6', 'recommend', 620, "Modern controls got three friends into fighting games. The genre finally solved onboarding."],
  ['demo_throwloop', 'street-fighter-6', 'recommend', 450, "Drive system rewards aggression without punishing learning. Best entry point in decades."],
  ['demo_framedata', 'tekken-8', 'recommend', 380, "Heat rewards pressing forward, which is right. Panic mashing still gets punished hard."],
  ['demo_wakeupdp', 'tekken-8', 'recommend', 700, "Deepest movement in any fighter. Also there is a bear, and that matters to me."],
  ['demo_throwloop', 'tekken-8', 'mixed', 120, "Superb mechanically, rough online. Wi-fi opponents undo a lot of the good work."],
  ['demo_wakeupdp', 'mk1', 'mixed', 90, "Story mode is genuinely well made. Competitive side has never held me for long."],
  ['demo_throwloop', 'smash-ultimate', 'recommend', 900, "Every character, every stage. Still the definitive game to put on for a room."],
  ['demo_framedata', 'smash-ultimate', 'recommend', 500, "Competitive depth people underestimate because it looks like a party game."],

  // --- indie and puzzle ---
  ['demo_quietcredits', 'celeste', 'recommend', 50, "Hardest thing I have finished, and assist options mean anyone can finish it too."],
  ['demo_indiepilgrim', 'celeste', 'recommend', 62, "Every screen teaches something. The B-sides are a whole second game."],
  ['demo_quietcredits', 'outer-wilds', 'recommend', 28, "Twenty-two minutes and one solar system. The best discovery in any game, full stop."],
  ['demo_deducer', 'outer-wilds', 'recommend', 33, "Knowledge is the only progression. Nothing else respects a notebook this much."],
  ['demo_deducer', 'obra-dinn', 'recommend', 14, "Deduce how sixty sailors died. The most satisfying detective work ever built."],
  ['demo_quietcredits', 'obra-dinn', 'recommend', 11, "One playthrough, no replay value, completely worth it. The art style is genius."],
  ['demo_deducer', 'blue-prince', 'recommend', 60, "Draft rooms, uncover a secret, fill a notebook. Bring actual paper."],
  ['demo_indiepilgrim', 'blue-prince', 'recommend', 48, "Roguelike structure serving a mystery rather than combat. Clever and patient."],
  ['demo_deducer', 'chants-of-sennaar', 'recommend', 12, "Decipher invented languages from context alone. Makes you feel like a genius."],
  ['demo_quietcredits', 'undertale', 'recommend', 20, "You do not have to kill anything, and it remembers what you did. Still remarkable."],
  ['demo_indiepilgrim', 'tunic', 'recommend', 26, "A cute fox adventure hiding one of the cleverest puzzle games ever made."],
  ['demo_quietcredits', 'balatro', 'recommend', 90, "Installed it at an airport, still on my phone months later. Deeply irresponsible."],
  ['demo_deducer', 'balatro', 'recommend', 130, "Build optimisation wearing poker as a costume. The joker interactions are the game."],
  ['demo_indiepilgrim', 'silksong', 'recommend', 55, "Faster and meaner than the first. Fixes the exact thing people found slow."],

  // --- family and couch ---
  ['demo_sofaplayer', 'mario-odyssey', 'recommend', 70, "Movement so good you jump around for fun. Uncynical delight, start to finish."],
  ['demo_twocontrollers', 'mario-odyssey', 'recommend', 45, "Two-player assist mode let my partner join without frustration. Lovely design."],
  ['demo_familyroom', 'astro-bot', 'recommend', 20, "Purest joy on the console. Every level has an idea and then moves on."],
  ['demo_sofaplayer', 'astro-bot', 'recommend', 25, "Best platformer since Odyssey and I do not say that lightly."],
  ['demo_twocontrollers', 'mario-kart-world', 'recommend', 300, "The only game the whole family plays without an argument. Mostly."],
  ['demo_sofaplayer', 'portal-2', 'recommend', 14, "Perfect pacing, perfect jokes, and a co-op campaign that is a separate gift."],
  ['demo_twocontrollers', 'it-takes-two', 'recommend', 16, "Mandatory two-player and it never wastes a mechanic. Finished it in two sittings."],
  ['demo_twocontrollers', 'split-fiction', 'recommend', 15, "Hazelight again, even more generous. My partner does not play games and finished it."],
  ['demo_familyroom', 'splatoon-3', 'recommend', 120, "Ink the floor, not the enemy. Most original shooter idea in years, and kid-friendly."],
  ['demo_sofaplayer', 'zelda-totk', 'recommend', 190, "Every daft plan works. Built a flying machine from rubbish and it just let me keep it."],

  // --- mmo and co-op grind ---
  ['demo_tankmain', 'ffxiv', 'recommend', 4000, "Tanking Savage with the same eight people for years. The story is genuinely the draw."],
  ['demo_tankmain', 'wow', 'recommend', 6000, "Twenty years of raid nights. Still the benchmark for endgame group content."],
  ['demo_raidnight', 'wow', 'mixed', 900, "Raiding is unmatched, everything between raids is a chore I have stopped tolerating."],
  ['demo_tankmain', 'destiny-2', 'recommend', 1800, "Gunfeel with no equal and raids that are actual puzzles. The onboarding is indefensible."],
  ['demo_hordeclear', 'destiny-2', 'mixed', 400, "Best shooting in the genre, worst menus. I keep coming back and keep regretting it."],
  ['demo_hordeclear', 'monster-hunter-wilds', 'recommend', 520, "Learn one monster for forty hours, then wear it. Nothing rewards patience like this."],
  ['demo_tankmain', 'monster-hunter-wilds', 'recommend', 240, "Same satisfaction as a progression raid, except the boss has a home and a schedule."],
  ['demo_hordeclear', 'warframe', 'recommend', 2000, "Space ninja power fantasy, free, enormous, and impossible to explain to anyone."],
  ['demo_hordeclear', 'deep-rock', 'recommend', 700, "Rock and stone. Four classes that genuinely need each other, which is rare."],
  ['demo_squadwipe', 'warframe', 'mixed', 150, "Incredible movement, overwhelming systems. I needed a friend to translate the first ten hours."],

  // --- shooters, filling out the cluster ---
  ['demo_headglitch', 'cs2', 'mixed', 90, "I respect it and cannot play it. Coming from CoD the movement feels like wet sand."],
  ['demo_ttkdiff', 'cs2', 'recommend', 400, "Every loss is explainable, which is the highest praise for a competitive game."],
  ['demo_headglitch', 'r6-siege', 'recommend', 900, "Breach a wall, hold an angle, win the round. Tense in a way nothing else manages."],
  ['demo_ttkdiff', 'r6-siege', 'recommend', 600, "Destruction as a tactical layer, years before anyone else tried it properly."],
  ['demo_tacticaldad', 'r6-siege', 'recommend', 1200, "The only shooter where preparation beats reflexes. Learning maps is the whole game."],
  ['demo_headglitch', 'apex-legends', 'recommend', 700, "Most fluid movement in any battle royale. Squad pings changed the entire genre."],
  ['demo_ttkdiff', 'apex-legends', 'mixed', 200, "Movement ceiling is enormous, which is thrilling and also exhausting to keep up with."],
  ['demo_sprintreload', 'the-finals', 'recommend', 180, "Bring the floor down and the fight is over. Destruction is the tactics here."],
  ['demo_headglitch', 'the-finals', 'recommend', 240, "Most underrated shooter going. Feels like nothing else on the market."],
  ['demo_sprintreload', 'marvel-rivals', 'recommend', 160, "Destructible maps change how you take fights. Feels like Overwatch before it got solved."],
  ['demo_ttkdiff', 'marvel-rivals', 'mixed', 80, "Fun and chaotic, balance is a rumour. Fine if you are not chasing rank."],
  ['demo_tacticaldad', 'overwatch-2', 'mixed', 300, "Mechanically sharp, socially draining. Five-player teams made every mistake louder."],
  ['demo_headglitch', 'overwatch-2', 'recommend', 500, "Still the most readable team shooter. Role queue fixed more than people admit."],
  ['demo_sprintreload', 'doom-eternal', 'recommend', 60, "A violent rhythm game wearing a shooter's clothes. Keep moving or die."],
  ['demo_ttkdiff', 'doom-eternal', 'recommend', 45, "Highest skill expression in any single-player shooter. The resource loop is genius."],
  ['demo_tacticaldad', 'titanfall-2', 'recommend', 90, "Wall-run into a mech. That campaign is a six-hour masterclass and everyone should play it."],
  ['demo_headglitch', 'titanfall-2', 'recommend', 400, "Still the best movement in a shooter, eight years on. Nothing has caught it."],
  ['demo_sprintreload', 'halo-infinite', 'recommend', 220, "The gunplay sings again and the grapple makes the sandbox playful. Took a while."],
  ['demo_ttkdiff', 'battlefield-1', 'recommend', 500, "The mud, the weather, the way a shell shuts down all other sound. Peak atmosphere."],
  ['demo_headglitch', 'battlefield-1', 'recommend', 380, "Best sounding shooter ever made and the setting carries real weight."],

  // --- cozy, filling out the cluster ---
  ['demo_slowmorning', 'animal-crossing-nh', 'recommend', 380, "Nothing is urgent and that is the whole point. Still open it most mornings."],
  ['demo_teatime', 'coral-island', 'recommend', 190, "Stardew with better art and a reef to restore. Diving is a genuinely lovely addition."],
  ['demo_quietfarm', 'coral-island', 'recommend', 140, "Warmer than the game it is modelled on. The town actually feels lived in."],
  ['demo_teatime', 'spiritfarer', 'recommend', 45, "A cosy game about dying that earns every tear. The boat becoming home is the trick."],
  ['demo_quietfarm', 'spiritfarer', 'recommend', 38, "I cried on a bus. Management systems are gentle enough to never get in the way."],
  ['demo_teatime', 'dave-the-diver', 'recommend', 60, "Diving, then sushi, then somehow a farm. Should be a mess and is instead delightful."],
  ['demo_slowmorning', 'unpacking', 'recommend', 6, "A whole life told through where someone puts their mugs. Quietly devastating."],
  ['demo_quietfarm', 'powerwash-sim', 'recommend', 70, "Clean dirty things. Astonishingly effective and I have stopped questioning it."],
  ['demo_slowmorning', 'a-short-hike', 'recommend', 4, "Ninety minutes, no stress, and I think about it more than hundred-hour games."],
  ['demo_teatime', 'slime-rancher-2', 'recommend', 55, "Vacuum adorable slimes on a pastel planet. Genuinely lowers my heart rate."],
  ['demo_slowmorning', 'dorfromantik', 'recommend', 40, "Place tiles, build somewhere peaceful. A puzzle game that never once rushes you."],

  // --- story cluster, filling out ---
  ['demo_lastsave', 'ghost-of-tsushima', 'recommend', 80, "Most beautiful open world Sony has made and the duels feel like cinema."],
  ['demo_dialoguetree', 'ghost-of-tsushima', 'mixed', 40, "Gorgeous and structurally very familiar. The standoffs are the bit I remember."],
  ['demo_lastsave', 'spiderman-2', 'recommend', 35, "Web-swinging is still the best traversal in games. Pure joy to just move."],
  ['demo_storyfirst', 'spiderman-2', 'mixed', 28, "Traversal is perfect, the open world around it is the usual checklist."],
  ['demo_dialoguetree', 'disco-elysium', 'recommend', 85, "The best prose in any game. You investigate a murder and mostly investigate yourself."],
  ['demo_lastsave', 'disco-elysium', 'recommend', 60, "No combat, all consequence. Failing a check produces better writing than passing one."],
  ['demo_storyfirst', 'tlou-2', 'recommend', 45, "Deliberately uncomfortable and completely in command of what it is doing."],
  ['demo_dialoguetree', 'tlou-2', 'mixed', 30, "Technically astonishing, structurally punishing. I admired it more than I enjoyed it."],
  ['demo_lastsave', 'gow-ragnarok', 'recommend', 52, "Spectacle that earns its quiet moments. The axe recall is the best input in games."],
  ['demo_storyfirst', 'baldurs-gate-3', 'recommend', 210, "It says yes to everything. The high-water mark for player freedom, easily."],
  ['demo_dialoguetree', 'witcher-3', 'recommend', 240, "Best side quests ever written. A missing goat becomes a short story."],
  ['demo_lastsave', 'witcher-3', 'recommend', 150, "Ten years on nothing has matched the writing. Combat is the price of admission."],

  // --- souls cluster, filling out ---
  ['demo_parrytimer', 'sekiro', 'recommend', 300, "Deflect, do not dodge. A rhythm of steel that clicks and then never lets go."],
  ['demo_ashenone', 'sekiro', 'recommend', 180, "Hardest and best of them. Once the parry timing lands you feel unstoppable."],
  ['demo_lorehound', 'sekiro', 'recommend', 220, "Least forgiving, most rewarding. Boss order matters less than learning to hold your ground."],
  ['demo_parrytimer', 'bloodborne', 'recommend', 260, "Victorian cosmic horror with the most aggressive combat FromSoft ever built."],
  ['demo_ashenone', 'bloodborne', 'recommend', 210, "Taking the shield away was the whole design. Still my favourite of theirs."],
  ['demo_ashenone', 'wukong', 'recommend', 90, "Spectacular bosses rooted in mythology most games ignore. Traversal is the weak part."],
  ['demo_parrytimer', 'hollow-knight', 'recommend', 85, "Soulslike lessons in two dimensions, and the map is the actual puzzle."],
  ['demo_ashenone', 'silksong', 'recommend', 70, "Meaner and faster. Worth every year of the wait, which I did not expect to say."],

  // Reviews aimed at what each taste actually gets recommended. Reviewing
  // only the games a cluster already loves left the card invisible, because
  // those games are excluded from that cluster's own recommendations.

  // souls -> lies-of-p, wukong, bloodborne, ac-shadows, diablo-4
  ['demo_lorehound', 'lies-of-p', 'recommend', 66, "Best non-FromSoft soulslike by a distance. The weapon assembly system is inspired."],
  ['demo_lorehound', 'wukong', 'mixed', 52, "The bosses are worth it. Everything between them is a corridor with nice lighting."],
  ['demo_parrytimer', 'wukong', 'recommend', 78, "Parry-adjacent combat that rewards nerve. Closest thing to Sekiro's rhythm outside Sekiro."],
  ['demo_lorehound', 'bloodborne', 'recommend', 190, "Still their best atmosphere. Trick weapons make every build feel like a different game."],
  ['demo_ashenone', 'ac-shadows', 'mixed', 60, "Feudal Japan is gorgeous and the stealth is real, but the combat lacks weight after a soulslike."],
  ['demo_parrytimer', 'ac-shadows', 'mixed', 45, "Two protagonists who genuinely play differently. Wish the parries mattered more."],
  ['demo_lorehound', 'ac-shadows', 'recommend', 90, "Best Assassin's Creed in a decade and the setting earns the wait."],
  ['demo_ashenone', 'diablo-4', 'mixed', 120, "Click demons, get trousers. Satisfying combat, seasonal treadmill I keep stepping off."],
  ['demo_parrytimer', 'diablo-4', 'avoid', 30, "Combat has no weight to it after soulslikes. Numbers going up is not enough for me."],
  ['demo_lorehound', 'diablo-4', 'mixed', 85, "Atmosphere is genuinely strong, the endgame loop is genuinely not. Play the campaign."],

  // fps -> pubg, battlefield-1, overwatch-2, apex-legends, the-finals, halo-infinite
  ['demo_sprintreload', 'pubg', 'mixed', 300, "The original and still the most nerve-shredding. Gunplay feels a decade old now."],
  ['demo_headglitch', 'pubg', 'recommend', 450, "Slower and heavier than Warzone, which is the point. Nothing else builds tension like it."],
  ['demo_ttkdiff', 'pubg', 'mixed', 120, "Brilliant when it works, rough when it does not. Still no substitute for the endgame circle."],
  ['demo_tacticaldad', 'battlefield-1', 'recommend', 260, "The one shooter where I do not mind losing. Atmosphere carries every match."],
  ['demo_ttkdiff', 'overwatch-2', 'mixed', 140, "Readable and sharp, but I want my time-to-kill lower. Personal taste, not a flaw."],
  ['demo_sprintreload', 'apex-legends', 'recommend', 380, "Movement ceiling is the highest in the genre. Pings changed how squads communicate."],
  ['demo_tacticaldad', 'apex-legends', 'mixed', 90, "Superb design, brutal skill gap. Coming in late is genuinely difficult."],
  ['demo_ttkdiff', 'the-finals', 'recommend', 200, "The most underrated shooter out. Bringing a building down mid-fight never gets old."],
  ['demo_headglitch', 'halo-infinite', 'recommend', 300, "Gunplay is back to its best and the grapple makes every sandbox toy better."],
  ['demo_tacticaldad', 'halo-infinite', 'mixed', 110, "Feels great, content cadence was painful. Better now than at launch by far."],

  // cozy -> slime-rancher-2, dave-the-diver, powerwash-sim, unpacking, cities-skylines-2, tunic
  ['demo_quietfarm', 'slime-rancher-2', 'recommend', 62, "Pastel, gentle and completely without threat. Exactly what I want after work."],
  ['demo_slowmorning', 'slime-rancher-2', 'recommend', 48, "Collecting slimes is a lovely loop and the world is genuinely calming to move through."],
  ['demo_quietfarm', 'dave-the-diver', 'recommend', 70, "Diving then sushi then a farm. Chaotic on paper, relaxing in practice."],
  ['demo_slowmorning', 'powerwash-sim', 'recommend', 90, "Clean dirty things while listening to something. Best stress relief I own."],
  ['demo_teatime', 'powerwash-sim', 'recommend', 40, "No fail state, visible progress, gentle sounds. It understands what cosy means."],
  ['demo_quietfarm', 'unpacking', 'recommend', 7, "Learning a life from where the mugs go. Short and stays with you."],
  ['demo_teatime', 'cities-skylines-2', 'recommend', 80, "Deeply calming until the sewage backs up. Building without any pressure is the appeal."],
  ['demo_quietfarm', 'cities-skylines-2', 'mixed', 45, "Lovely to potter in, heavy on the laptop. I mostly build and never optimise."],
  ['demo_slowmorning', 'cities-skylines-2', 'recommend', 130, "Traffic as meditation. I have never once tried to win at this."],
  ['demo_teatime', 'tunic', 'recommend', 30, "Adorable fox, secretly a very clever puzzle game. Gentler than it first looks."],
  ['demo_quietfarm', 'tunic', 'mixed', 18, "Charming and harder than I expected. Lovely to look at throughout."],
  ['demo_slowmorning', 'tunic', 'recommend', 26, "The manual is the puzzle, which is delightful. Took my time and loved it."],

  // strategy -> stellaris, ck3, football-manager, total-war, frostpunk-2
  ['demo_turnorder', 'stellaris', 'recommend', 340, "Galactic empire building with real surprises on the rim. Mid-game crises carry it."],
  ['demo_turnorder', 'ck3', 'recommend', 480, "Medieval dynasty roleplay where your heir is an idiot and it is entirely your fault."],
  ['demo_gridcontrol', 'ck3', 'recommend', 300, "The systems generate stories nothing scripted matches. My best campaigns were disasters."],
  ['demo_spreadsheetops', 'ck3', 'recommend', 210, "Closest thing to a novel generator. Learning curve is real and worth it."],
  ['demo_spreadsheetops', 'football-manager-25', 'recommend', 900, "A spreadsheet that makes you feel real emotion about a Norwegian left-back."],
  ['demo_turnorder', 'football-manager-25', 'recommend', 400, "Same appeal as a 4X: long horizons, tiny decisions compounding. Enormous time sink."],
  ['demo_gridcontrol', 'football-manager-25', 'mixed', 150, "Depth is astonishing, presentation is a wall of text. Not for everyone."],
  ['demo_spreadsheetops', 'total-war-warhammer-3', 'recommend', 360, "Campaign map plus real-time battles is still an unmatched combination."],
  ['demo_turnorder', 'frostpunk-2', 'recommend', 90, "Every law costs someone something. Bleak, brilliant, and genuinely about governing."],
  ['demo_gridcontrol', 'frostpunk-2', 'recommend', 120, "City building where the hard part is politics rather than logistics. Bold sequel."],
  ['demo_spreadsheetops', 'frostpunk-2', 'mixed', 60, "Strong ideas, fiddly execution in places. The first game was tighter."],

  // horror -> re-village, lethal-company, dead-by-daylight, alan-wake-2, outlast-trials
  ['demo_lastlight', 're-village', 'recommend', 55, "Four horror styles in one game and all four land. The castle section is the peak."],
  ['demo_dreadpitch', 'lethal-company', 'recommend', 80, "Cheap, ugly, and the funniest horror I have played. Proximity chat does everything."],
  ['demo_lastlight', 'lethal-company', 'recommend', 110, "Genuine dread and genuine laughter in the same run. Nothing else manages both."],
  ['demo_lastlight', 'dead-by-daylight', 'recommend', 400, "Eight years of licensed crossovers and the chase loop still works. Pick one killer."],
  ['demo_nightshift', 'alan-wake-2', 'recommend', 60, "A survival horror art film that fully commits. Nothing else looks or sounds like it."],
  ['demo_nightshift', 'outlast-trials', 'recommend', 90, "Relentlessly unpleasant, which is the job. Co-op makes it bearable and funnier."],
  ['demo_dreadpitch', 'outlast-trials', 'mixed', 45, "Effective and exhausting. I can do about an hour before I need something gentle."],
  ['demo_lastlight', 'outlast-trials', 'recommend', 70, "Best pure-fear co-op going. No weapons means every encounter is a chase."],

  // jrpg -> genshin-impact, pokemon-sv, mass-effect-le, undertale
  ['demo_animeframes', 'genshin-impact', 'mixed', 400, "Genuinely gorgeous world attached to a gacha. Free until it very much is not."],
  ['demo_limitbreak', 'genshin-impact', 'recommend', 600, "Exploration and combat are better than the business model deserves. Play it free."],
  ['demo_aeriths', 'genshin-impact', 'mixed', 220, "Story has grown into something real. The energy system still decides when I stop."],
  ['demo_aeriths', 'pokemon-sv', 'mixed', 120, "Open world is the right direction, performance is not. The story surprised me."],
  ['demo_animeframes', 'mass-effect-le', 'recommend', 130, "Three games, one save, a crew you think about years later. Still the benchmark."],
  ['demo_limitbreak', 'mass-effect-le', 'recommend', 100, "Party-based storytelling done properly. The second game is near-perfect."],
  ['demo_aeriths', 'mass-effect-le', 'recommend', 160, "Companion writing that JRPGs should study. The trilogy structure pays off enormously."],
  ['demo_animeframes', 'undertale', 'recommend', 25, "Short, strange, and it remembers. Subverts the genre without sneering at it."],
  ['demo_limitbreak', 'undertale', 'recommend', 18, "The pacifist route rewires how you read every enemy. Soundtrack is untouchable."],

  // indie -> silksong, metroid-dread, tunic, dead-cells, baba-is-you, a-short-hike
  ['demo_quietcredits', 'silksong', 'recommend', 48, "Harder and faster. The art alone would carry it even without the combat."],
  ['demo_deducer', 'silksong', 'mixed', 30, "Superb, and less patient with newcomers than the first. Bring your reflexes."],
  ['demo_indiepilgrim', 'metroid-dread', 'recommend', 22, "Tight, tense, fast. Best 2D Metroid since Super and the EMMI sections earn their fear."],
  ['demo_quietcredits', 'metroid-dread', 'recommend', 18, "Movement feels wonderful and the map slowly becomes yours. Very clean design."],
  ['demo_deducer', 'metroid-dread', 'recommend', 25, "Structure is impeccable. Every ability opens exactly what it should, when it should."],
  ['demo_deducer', 'tunic', 'recommend', 34, "The in-game manual is the real puzzle. One of the great secrets in games."],
  ['demo_indiepilgrim', 'dead-cells', 'recommend', 90, "Buttery combat, short runs, endless 'one more go'. The best action roguelike."],
  ['demo_quietcredits', 'dead-cells', 'recommend', 70, "Fails forward properly. Every death teaches something and the pace never sags."],
  ['demo_deducer', 'dead-cells', 'mixed', 40, "Feels magnificent, though I prefer a puzzle to a reflex test in the long run."],
  ['demo_deducer', 'baba-is-you', 'recommend', 40, "You rewrite the rules of each level. Will make you feel stupid then brilliant."],
  ['demo_quietcredits', 'baba-is-you', 'recommend', 28, "Hardest puzzle game I own and completely fair throughout. Remarkable design."],
  ['demo_indiepilgrim', 'baba-is-you', 'recommend', 33, "Pure mechanics, no fat. The moment a rule clicks is unmatched anywhere."],
  ['demo_indiepilgrim', 'a-short-hike', 'recommend', 3, "Ninety gentle minutes and it lands better than most long games. Perfect scope."],
  ['demo_deducer', 'a-short-hike', 'recommend', 4, "No puzzle to solve and I loved it anyway. The gliding feels wonderful."],

  // racing -> assetto-corsa-evo, mario-kart-world, nba-2k25, ea-fc-25, splatoon-3
  ['demo_gridline', 'assetto-corsa-evo', 'mixed', 60, "Uncompromising and brilliant, but I want to be able to play with a pad."],
  ['demo_apexline', 'assetto-corsa-evo', 'recommend', 140, "If you want the closest thing to real driving, this is it. Steep entry, huge payoff."],
  ['demo_pitwall', 'mario-kart-world', 'recommend', 120, "Even sim people should own this. Perfect when you want twenty minutes of nonsense."],
  ['demo_apexline', 'mario-kart-world', 'recommend', 200, "Best-selling kart racer for good reason. Blue shells are a design masterstroke."],
  ['demo_pitwall', 'nba-2k25', 'mixed', 70, "The on-court simulation is superb. Everything wrapped around it wants my wallet."],
  ['demo_gridline', 'nba-2k25', 'mixed', 110, "Plays beautifully, monetised aggressively. Play the offline modes and stop there."],
  ['demo_gridline', 'ea-fc-25', 'mixed', 260, "Best it has felt in years on the pitch. Ultimate Team is a separate, worse game."],
  ['demo_gridline', 'splatoon-3', 'recommend', 90, "Ink the floor, not the enemy. The most original shooter concept in years."],
  ['demo_apexline', 'splatoon-3', 'recommend', 130, "Objective-first shooter where aim matters least. Refreshing and genuinely competitive."],
  ['demo_pitwall', 'splatoon-3', 'mixed', 40, "Charming and chaotic. Not my genre but I understand why people are devoted."],

  // family -> astro-bot, split-fiction, it-takes-two, forza-horizon-5, fall-guys, smash-ultimate
  ['demo_twocontrollers', 'astro-bot', 'recommend', 22, "Joy in every level. My kids finished it and immediately started again."],
  ['demo_sofaplayer', 'split-fiction', 'recommend', 17, "Two players, endless invention, no filler. Nobody else is this generous."],
  ['demo_familyroom', 'split-fiction', 'recommend', 14, "Played it with someone who does not play games. She finished it. Highest praise."],
  ['demo_sofaplayer', 'it-takes-two', 'recommend', 15, "Every level teaches a new mechanic then throws it away. Mandatory co-op, worth it."],
  ['demo_familyroom', 'it-takes-two', 'recommend', 13, "The best game to play with a partner. Genuinely funny in places too."],
  ['demo_familyroom', 'forza-horizon-5', 'recommend', 140, "Everyone in the house can drive it badly and still have fun. Beautiful too."],
  ['demo_sofaplayer', 'forza-horizon-5', 'recommend', 60, "Relaxing, forgiving, gorgeous. The only racing game my family agrees on."],
  ['demo_twocontrollers', 'forza-horizon-5', 'recommend', 95, "Split the map, drive around, ignore the races. Lovely way to spend an evening."],
  ['demo_familyroom', 'fall-guys', 'recommend', 80, "Sixty beans, one crown, endless indignity. Free and perfect for a room of kids."],
  ['demo_sofaplayer', 'fall-guys', 'recommend', 55, "Chaotic in the right way and nobody minds losing. Great with young players."],
  ['demo_twocontrollers', 'fall-guys', 'mixed', 30, "Fun in short bursts. The later seasons lean harder on precision than chaos."],
  ['demo_sofaplayer', 'smash-ultimate', 'recommend', 420, "Every character, every stage. The definitive thing to put on for a room of people."],
  ['demo_familyroom', 'smash-ultimate', 'recommend', 260, "Works for eight-year-olds and tournament players simultaneously. Extraordinary."],

  // mmo -> wow, diablo-4, borderlands-3, eso, warframe, poe-2, deep-rock
  ['demo_hordeclear', 'wow', 'recommend', 2200, "Still the benchmark for endgame group content. Nothing else has the raid cadence."],
  ['demo_raidnight', 'diablo-4', 'mixed', 260, "Seasonal loop is well built and I resent how well it works on me."],
  ['demo_tankmain', 'diablo-4', 'recommend', 340, "Best moment-to-moment combat in the genre. Endgame is thin but the seasons help."],
  ['demo_hordeclear', 'diablo-4', 'recommend', 500, "Loot chase done properly. Play a season, stop, come back. That is the right way."],
  ['demo_hordeclear', 'borderlands-3', 'recommend', 220, "A billion guns and a co-op loop that turns numbers into a lifestyle."],
  ['demo_raidnight', 'borderlands-3', 'mixed', 90, "Shooting is great, writing is exhausting. Play it muted with friends."],
  ['demo_tankmain', 'borderlands-3', 'recommend', 160, "Best four-player looter shooter for people who want builds rather than raids."],
  ['demo_tankmain', 'eso', 'recommend', 900, "Skyrim-shaped MMO you can genuinely play solo. Zone stories are the highlight."],
  ['demo_raidnight', 'eso', 'mixed', 300, "Enormous and welcoming, combat never quite satisfies. The writing carries it."],
  ['demo_hordeclear', 'eso', 'recommend', 400, "One-bar builds and no subscription needed. Easiest MMO to dip in and out of."],
  ['demo_raidnight', 'warframe', 'recommend', 1500, "Free, enormous, and the movement is the best in any shooter. Confusing for a month."],
  ['demo_tankmain', 'poe-2', 'recommend', 300, "A skill tree the size of a country. For people who read spreadsheets for fun."],
  ['demo_hordeclear', 'poe-2', 'recommend', 450, "Deepest build crafting anywhere. Punishing and completely absorbing."],
  ['demo_raidnight', 'poe-2', 'mixed', 120, "Astonishing depth, brutal onboarding. I needed a guide open at all times."],
  ['demo_tankmain', 'deep-rock', 'recommend', 380, "Four classes that genuinely need each other. Best co-op design going."],

  // fighting -> mk1, rocket-league, splatoon-3, starcraft-2
  ['demo_framedata', 'mk1', 'mixed', 140, "Kameo assists are a good idea. The neutral game never grabbed me the way Tekken does."],
  ['demo_throwloop', 'mk1', 'recommend', 200, "Gore aside, the story mode is genuinely well made and the tag system is clever."],
  ['demo_framedata', 'rocket-league', 'recommend', 300, "Same read-and-react loop as a fighter, with none of the execution barrier."],
  ['demo_wakeupdp', 'rocket-league', 'recommend', 420, "Mechanical ceiling is enormous. Feels exactly like learning combos, in a car."],
  ['demo_throwloop', 'rocket-league', 'recommend', 260, "The one game my whole fighting-game group plays together without arguing."],
  ['demo_wakeupdp', 'splatoon-3', 'recommend', 110, "Movement and positioning over aim. Surprisingly deep once you commit to a weapon."],
  ['demo_framedata', 'starcraft-2', 'recommend', 400, "Most demanding competitive game ever made. Execution under pressure, same as a fighter."],
  ['demo_wakeupdp', 'starcraft-2', 'recommend', 260, "Mechanics you drill like combos. Campaigns are excellent even if you never go online."],
  ['demo_throwloop', 'starcraft-2', 'mixed', 90, "Enormous respect, too much homework. I want my matches to last three minutes."],

  // sandbox -> lego-fortnite, grounded, palworld, the-forest, subnautica, ark, rust
  ['demo_redstoner', 'lego-fortnite', 'recommend', 160, "A complete survival crafting game, free, inside another game. Genuinely good."],
  ['demo_blockbuilder', 'lego-fortnite', 'mixed', 70, "Building is fun, progression is thin. Great for younger players though."],
  ['demo_voxelkid', 'grounded', 'recommend', 180, "Honey I Shrunk the Kids as survival. The arachnophobia slider is a kind touch."],
  ['demo_redstoner', 'grounded', 'recommend', 140, "Base building in the grass is inventive and the bug designs are excellent."],
  ['demo_blockbuilder', 'grounded', 'recommend', 90, "Best co-op survival for people who find Rust hostile. Charming throughout."],
  ['demo_voxelkid', 'palworld', 'recommend', 200, "Creature collecting plus automation. My friends and I lost a whole month."],
  ['demo_redstoner', 'the-forest', 'recommend', 120, "Build the fortress before the cannibals arrive. Kelvin is doing his best."],
  ['demo_blockbuilder', 'the-forest', 'recommend', 95, "Genuinely tense base building. The cave sections are horror whether you want it or not."],
  ['demo_voxelkid', 'the-forest', 'mixed', 40, "Great with friends, unsettling alone. Crafting is fiddlier than it needs to be."],
  ['demo_voxelkid', 'subnautica', 'recommend', 60, "Fear of the deep turned into wonder. Do not look up a single thing first."],
  ['demo_blockbuilder', 'subnautica', 'recommend', 80, "Base building underwater beats base building anywhere else. Astonishing progression."],
  ['demo_redstoner', 'ark-ascended', 'mixed', 300, "Taming is brilliant, everything around it is a grind. Play on a private server."],
  ['demo_blockbuilder', 'ark-ascended', 'mixed', 180, "Dinosaurs carry it. Official servers will take your base and your evening."],
  ['demo_voxelkid', 'ark-ascended', 'avoid', 50, "Wanted to love it. Too much time lost to things outside my control."],
  ['demo_redstoner', 'rust', 'mixed', 400, "Peak online cruelty and occasionally the best stories you will ever tell."],
  ['demo_blockbuilder', 'rust', 'avoid', 60, "Building is excellent, the community is not. I want to build, not defend."],
  ['demo_voxelkid', 'rust', 'mixed', 120, "Brutal and brilliant in equal measure. Do not play solo, ever."],

  // Tightened clusters reviewing what their taste actually gets recommended.
  ['demo_pogosticker', 'silksong', 'recommend', 62, "Everything the first game did, faster. The movement upgrades feel superb."],
  ['demo_nomapneeded', 'silksong', 'recommend', 50, "Getting lost is still the point and it is still wonderful. Hornet controls beautifully."],
  ['demo_pogosticker', 'metroid-dread', 'recommend', 24, "Tight, fast and mean in the right places. The counter window is perfectly judged."],
  ['demo_nomapneeded', 'metroid-dread', 'recommend', 20, "Best 2D Metroid in decades. Every upgrade opens exactly the door you hoped."],
  ['demo_pogosticker', 'dead-cells', 'recommend', 120, "Combat feels incredible and runs are the perfect length. Endlessly replayable."],
  ['demo_nomapneeded', 'dead-cells', 'recommend', 85, "Fails forward properly. I never once felt a death was the game's fault."],
  ['demo_pogosticker', 'baba-is-you', 'recommend', 30, "Rewriting the rules never stops being clever. Genuinely brilliant design."],
  ['demo_nomapneeded', 'baba-is-you', 'recommend', 36, "Pure logic, zero padding. The best puzzle game of the last decade."],
  ['demo_pogosticker', 'tunic', 'recommend', 28, "Looks gentle, hides a real puzzle box. The manual is the whole trick."],
  ['demo_nomapneeded', 'tunic', 'recommend', 31, "Discovery-driven in the same way Outer Wilds is. Knowledge is the upgrade."],
  ['demo_nomapneeded', 'a-short-hike', 'recommend', 4, "Small, warm, complete. Exactly as long as it needs to be."],
  ['demo_pogosticker', 'undertale', 'recommend', 22, "Subverts everything without being smug about it. Still holds up entirely."],
  ['demo_nomapneeded', 'obra-dinn', 'recommend', 13, "Deduction with no hand-holding. Finishing it feels genuinely earned."],
  ['demo_pogosticker', 'mario-odyssey', 'recommend', 55, "Movement so good you play with it for its own sake. Joyful throughout."],
  ['demo_nomapneeded', 'mario-odyssey', 'recommend', 40, "Every kingdom has an idea and moves on before it wears out. Beautifully paced."],

  ['demo_okizeme', 'mk1', 'mixed', 130, "Kameos are a genuinely good idea, neutral game is looser than I like."],
  ['demo_meterburn', 'mk1', 'recommend', 180, "Story mode is the best in any fighter and the tag mechanics are inventive."],
  ['demo_okizeme', 'rocket-league', 'recommend', 380, "Execution ceiling like a fighting game with none of the matchup homework."],
  ['demo_meterburn', 'rocket-league', 'recommend', 240, "Reads, fakes and punishes. It is a fighting game with cars, honestly."],
  ['demo_okizeme', 'splatoon-3', 'recommend', 95, "Positioning over aim, which suits fighting-game brains. Deeper than it looks."],
  ['demo_meterburn', 'splatoon-3', 'mixed', 45, "Fun and chaotic, though I miss having a clear one-on-one to study."],
  ['demo_okizeme', 'starcraft-2', 'recommend', 300, "Drilling build orders is drilling combos. Hardest execution test in gaming."],
  ['demo_meterburn', 'starcraft-2', 'mixed', 100, "Enormous respect, too much preparation. I want a three-minute set, not a study plan."],
  ['demo_okizeme', 'mario-kart-world', 'recommend', 160, "The one thing everyone at a fighting-game meetup will actually agree to play."],
  ['demo_meterburn', 'mario-kart-world', 'recommend', 120, "Deceptively technical once you learn the drift timings. Great party game too."],
  ['demo_okizeme', 'cs2', 'recommend', 220, "Same appeal as a fighter: tiny inputs, huge consequences, everything readable."],
  ['demo_meterburn', 'split-fiction', 'recommend', 14, "Not my genre and I loved it. Constant invention, zero filler."],

  ['demo_materia', 'genshin-impact', 'mixed', 320, "Beautiful world, business model I keep resenting. Free is the right way to play it."],
  ['demo_summonurn', 'genshin-impact', 'recommend', 480, "Exploration is genuinely excellent and the recent story arcs are strong."],
  ['demo_materia', 'pokemon-sv', 'mixed', 100, "The open-world direction is right, the performance is indefensible. Story surprised me."],
  ['demo_summonurn', 'pokemon-sv', 'recommend', 140, "Best Pokemon story in years once you get past how it looks. Three routes work well."],
  ['demo_materia', 'mass-effect-le', 'recommend', 120, "Party writing JRPG fans will appreciate. The second game is close to perfect."],
  ['demo_summonurn', 'mass-effect-le', 'recommend', 150, "Companion arcs across three games. Nothing else pays off a save file like it."],
  ['demo_materia', 'undertale', 'recommend', 20, "Short, sharp, and it remembers what you did. The soundtrack is untouchable."],
  ['demo_summonurn', 'undertale', 'recommend', 17, "Turn-based combat reinvented as a bullet-hell conversation. Remarkable."],
  ['demo_materia', 'witcher-3', 'recommend', 180, "Side quests written like short stories. Combat is the toll you pay."],
  ['demo_summonurn', 'lies-of-p', 'mixed', 40, "Gorgeous and very hard. I wanted more party and story than it offers."],
  ['demo_materia', 'expedition-33', 'recommend', 95, "Turn-based with real-time dodges. The score and art direction are extraordinary."],
  ['demo_summonurn', 'ac-shadows', 'mixed', 55, "Feudal Japan is beautiful. Structure is the usual open-world checklist though."],
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

export const DEMO_CONTENT = { PEOPLE, REVIEWS, POSTS };

/** Guard against a game id in the demo data that is not in the catalogue. */
export function validateDemoContent() {
  const bad = [];
  for (const p of PEOPLE) for (const g of p.loves) if (!byId.has(g)) bad.push(`${p.username}:${g}`);
  for (const [, g] of REVIEWS) if (!byId.has(g)) bad.push(`review:${g}`);
  return bad;
}
