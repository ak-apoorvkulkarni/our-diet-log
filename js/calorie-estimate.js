/**
 * Rough calorie guesses from food name (local + optional USDA) or photo (MobileNet → label map).
 * Not medical advice — user can always edit the number.
 *
 * Optional: set window.__DIET_USDA_API_KEY__ for higher USDA rate limits (free key at data.gov).
 * Falls back to DEMO_KEY (strict rate limits).
 */

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";

function getUsdaKey() {
  if (typeof window !== "undefined" && window.__DIET_USDA_API_KEY__) {
    return String(window.__DIET_USDA_API_KEY__);
  }
  return "DEMO_KEY";
}

/** Typical single-plate / serving ballpark kcal — sorted longest-first for matching */
const COMMON_KEYWORD_KCAL = [
  ["chicken tikka masala", 650],
  ["butter chicken", 620],
  ["palak paneer", 480],
  ["paneer butter masala", 580],
  ["chicken biryani", 700],
  ["mutton biryani", 720],
  ["veg biryani", 520],
  ["hyderabadi biryani", 680],
  ["pav bhaji", 480],
  ["chole bhature", 620],
  ["chana masala", 380],
  ["rajma chawal", 520],
  ["dal makhani", 420],
  ["dal tadka", 280],
  ["masala dosa", 420],
  ["plain dosa", 220],
  ["rava dosa", 320],
  ["idli sambar", 320],
  ["idli", 180],
  ["medu vada", 320],
  ["uttapam", 380],
  ["poha", 280],
  ["upma", 260],
  ["paratha", 320],
  ["aloo paratha", 420],
  ["samosa", 260],
  ["pakora", 400],
  ["bhel puri", 320],
  ["pani puri", 360],
  ["dahi puri", 340],
  ["vada pav", 320],
  ["misal pav", 480],
  ["thali", 750],
  ["grilled salmon", 520],
  ["fried rice", 480],
  ["chicken fried rice", 560],
  ["sushi roll", 380],
  ["ramen", 480],
  ["pho", 420],
  ["caesar salad", 420],
  ["greek salad", 280],
  ["burrito", 520],
  ["taco", 220],
  ["quesadilla", 480],
  ["cheeseburger", 580],
  ["hamburger", 480],
  ["fish and chips", 720],
  ["full english", 820],
  ["english breakfast", 820],
  ["pancakes", 420],
  ["waffles", 380],
  ["oatmeal", 220],
  ["cereal", 200],
  ["granola", 280],
  ["smoothie", 240],
  ["protein shake", 200],
  ["pizza", 560],
  ["pepperoni pizza", 620],
  ["margherita", 480],
  ["pasta", 520],
  ["carbonara", 680],
  ["lasagna", 620],
  ["spaghetti", 520],
  ["mac and cheese", 520],
  ["steak", 520],
  ["ribeye", 640],
  ["chicken breast", 320],
  ["fried chicken", 620],
  ["nuggets", 420],
  ["wings", 480],
  ["kebab", 420],
  ["shawarma", 520],
  ["falafel", 420],
  ["hummus", 220],
  ["curry", 480],
  ["korma", 520],
  ["tikka", 420],
  ["naan", 260],
  ["roti", 120],
  ["chapati", 120],
  ["rice", 240],
  ["basmati rice", 220],
  ["jeera rice", 280],
  ["biryani", 600],
  ["dosa", 280],
  ["salad", 220],
  ["sandwich", 420],
  ["subway", 480],
  ["bagel", 280],
  ["croissant", 320],
  ["donut", 320],
  ["doughnut", 320],
  ["ice cream", 260],
  ["chocolate", 240],
  ["cake", 380],
  ["brownie", 320],
  ["cookie", 180],
  ["pie", 420],
  ["soup", 220],
  ["stew", 420],
  ["sushi", 380],
  ["noodles", 420],
  ["burger", 520],
  ["fries", 380],
  ["french fries", 380],
  ["potato", 180],
  ["egg", 140],
  ["eggs", 220],
  ["omelette", 280],
  ["toast", 180],
  ["yogurt", 180],
  ["fruit", 120],
  ["banana", 110],
  ["apple", 100],
  ["orange", 70],
  ["coffee", 40],
  ["latte", 180],
  ["cappuccino", 140],
  ["beer", 150],
  ["wine", 130],
];

const SORTED_KEYWORDS = [...COMMON_KEYWORD_KCAL].sort((a, b) => b[0].length - a[0].length);

function normalizeTitle(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** @returns {{ kcal: number, label: string } | null} */
export function getLocalKeywordMatchDetail(title) {
  const q = normalizeTitle(title);
  if (!q) return null;
  for (const [kw, kcal] of SORTED_KEYWORDS) {
    if (q.includes(kw)) return { kcal, label: kw };
  }
  return null;
}

export function roughCaloriesFromKeywords(title) {
  return getLocalKeywordMatchDetail(title)?.kcal ?? null;
}

function extractEnergyFromFoodDetail(food) {
  const nutrients = food.foodNutrients || [];
  let per100 = null;
  for (const fn of nutrients) {
    const nid = fn.nutrient?.id ?? fn.nutrientId;
    const nname = (fn.nutrient?.name || "").toLowerCase();
    if (nid === 1008 || nname.includes("energy")) {
      const amt = fn.amount;
      if (amt != null && !Number.isNaN(Number(amt)) && Number(amt) >= 0) {
        per100 = Number(amt);
        break;
      }
    }
  }
  if (per100 == null) return null;

  const g = food.servingSize;
  const unit = String(food.servingSizeUnit || "").toLowerCase();
  if (g && unit === "g" && g > 0) {
    return Math.round((per100 / 100) * g);
  }
  // Foundation / SR Legacy: energy is usually per 100 g — assume ~250 g plate
  return Math.round(per100 * 2.5);
}

async function fetchUsdaFoodKcal(fdcId) {
  const key = getUsdaKey();
  const url = `${USDA_BASE}/food/${fdcId}?api_key=${encodeURIComponent(key)}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const food = await r.json();
  return extractEnergyFromFoodDetail(food);
}

function truncDesc(s, max) {
  const t = String(s || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** @returns {{ kcal: number, description: string } | null} */
async function fetchUsdaSearchWithDetail(query) {
  const key = getUsdaKey();
  const url = `${USDA_BASE}/foods/search?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&pageSize=3&dataType=Foundation,SR Legacy,Branded`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const foods = j.foods;
  if (!Array.isArray(foods) || foods.length === 0) return null;
  for (const f of foods) {
    if (!f.fdcId) continue;
    const k = await fetchUsdaFoodKcal(f.fdcId);
    if (k != null) {
      const desc = (f.description || f.lowercaseDescription || "Matched food").trim();
      return { kcal: k, description: truncDesc(desc, 100) };
    }
  }
  return null;
}

/** ImageNet / MobileNet label fragments → rough kcal (longer keys matched first) */
const MOBILENET_LABEL_KCAL = [
  ["cheeseburger", 520],
  ["hot dog", 380],
  ["ice cream", 240],
  ["mashed potato", 220],
  ["french fries", 400],
  ["acorn squash", 90],
  ["butternut squash", 90],
  ["spaghetti squash", 85],
  ["custard apple", 120],
  ["granny smith", 80],
  ["chocolate sauce", 200],
  ["meat loaf", 520],
  ["french loaf", 400],
  ["red wine", 130],
  ["wine bottle", 120],
  ["beer bottle", 140],
  ["beer glass", 140],
  ["coffee mug", 60],
  ["soup bowl", 240],
  ["cheese fondue", 400],
  ["pizza", 520],
  ["bagel", 260],
  ["pretzel", 220],
  ["burrito", 500],
  ["taco", 240],
  ["doughnut", 300],
  ["trifle", 320],
  ["espresso", 10],
  ["plate", 450],
  ["potpie", 520],
  ["spaghetti", 560],
  ["carbonara", 620],
  ["broccoli", 80],
  ["cauliflower", 70],
  ["head cabbage", 45],
  ["cabbage", 50],
  ["cucumber", 25],
  ["bell pepper", 35],
  ["mushroom", 40],
  ["strawberry", 50],
  ["orange", 70],
  ["lemon", 20],
  ["banana", 100],
  ["pineapple", 85],
  ["pomegranate", 110],
  ["fig", 50],
  ["corn", 180],
  ["guacamole", 200],
  ["sushi", 400],
  ["consomme", 90],
  ["gazpacho", 100],
  ["omelette", 280],
  ["confectionery", 350],
  ["bakery", 400],
  ["restaurant", 500],
  ["eggnog", 350],
  ["ice lolly", 120],
  ["drumstick", 180],
  ["hen", 380],
  ["eel", 200],
  ["jellyfish", 80],
  ["sea cucumber", 60],
  ["rock crab", 180],
  ["fiddler crab", 100],
  ["dungeness", 200],
  ["king crab", 180],
  ["lobster", 180],
  ["crayfish", 120],
  ["shrimp", 200],
  ["oyster", 40],
  ["abalone", 120],
  ["conch", 140],
  ["fondue", 380],
  ["egg", 150],
  ["jackfruit", 180],
  ["artichoke", 80],
  ["hot pot", 420],
  ["cup", 80],
];

const SORTED_MOBILENET = [...MOBILENET_LABEL_KCAL].sort((a, b) => b[0].length - a[0].length);

function kcalFromMobilenetLabel(className) {
  const lower = String(className).toLowerCase();
  for (const [frag, kcal] of SORTED_MOBILENET) {
    if (lower.includes(frag)) {
      return { kcal, label: className };
    }
  }
  return null;
}

let mobilenetModelPromise = null;

async function loadMobilenetModel() {
  if (!mobilenetModelPromise) {
    mobilenetModelPromise = (async () => {
      await import("https://esm.sh/@tensorflow/tfjs@4.22.0");
      const m = await import("https://esm.sh/@tensorflow-models/mobilenet@2.1.1");
      return m.load();
    })();
  }
  return mobilenetModelPromise;
}

async function guessFromImageElement(img) {
  if (!img || !img.complete || !img.naturalWidth) return null;
  try {
    const model = await loadMobilenetModel();
    const preds = await model.classify(img);
    if (!preds?.length) return null;
    for (const p of preds.slice(0, 5)) {
      if ((p.probability || 0) < 0.04) continue;
      const hit = kcalFromMobilenetLabel(p.className);
      if (hit) return { ...hit, confidence: p.probability };
    }
    return null;
  } catch (e) {
    console.warn("calorie-estimate: image model failed", e);
    return null;
  }
}

function fileToImageEl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Need an image file"));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

async function resolveImageElement(imageElement, imageFile) {
  const el = imageElement;
  if (el && el.complete && el.naturalWidth) return el;
  if (imageFile) {
    return fileToImageEl(imageFile);
  }
  return null;
}

/**
 * @returns {{ kcal: number, source: string, reason: string } | { kcal: null, message: string }}
 */
export async function guessCalories({ title, imageElement, imageFile }) {
  const t = String(title || "").trim();

  if (t) {
    const local = getLocalKeywordMatchDetail(t);
    if (local != null) {
      return {
        kcal: local.kcal,
        source: "Built-in list",
        reason: `Matched a typical serving for “${local.label}” from our local dish list.`,
      };
    }
    try {
      const usda = await fetchUsdaSearchWithDetail(t);
      if (usda != null) {
        return {
          kcal: usda.kcal,
          source: "USDA FoodData Central",
          reason: `Used energy from USDA entry “${usda.description}” (scaled to a rough meal size).`,
        };
      }
    } catch (e) {
      console.warn("USDA lookup failed", e);
    }
  }

  let img;
  try {
    img = await resolveImageElement(imageElement, imageFile);
  } catch (e) {
    return { kcal: null, message: e.message || "Could not read the photo." };
  }

  if (img) {
    const fromImg = await guessFromImageElement(img);
    if (fromImg) {
      const guessLabel = fromImg.label.split(",")[0].trim();
      return {
        kcal: fromImg.kcal,
        source: "Image classifier (MobileNet)",
        reason: `Photo was classified as “${guessLabel}” and mapped to a rough kcal — often wrong; edit freely.`,
      };
    }
    if (t) {
      return {
        kcal: null,
        message:
          "No match for that name online. Try simpler words, or add a clearer photo — image guesses are very rough.",
      };
    }
    return {
      kcal: null,
      message:
        "Could not guess from this photo. Type what you ate (even roughly) and tap Guess again.",
    };
  }

  if (t) {
    return {
      kcal: null,
      message:
        "No match. Try simpler words (e.g. “rice”, “dosa”, “pizza”) or add a meal photo for a rough image guess.",
    };
  }

  return {
    kcal: null,
    message: "Type what you ate, or add a meal photo — then tap Guess ~kcal.",
  };
}
