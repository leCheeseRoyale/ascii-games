import mitt from "mitt";

type EngineEvents = {
  "game:start": undefined;
  "game:resume": undefined;
  "game:restart": undefined;
  "game:pause": undefined;
  "scene:loaded": string;
  "engine:started": undefined;
  "engine:stopped": undefined;
  "engine:paused": undefined;
  "engine:resumed": undefined;
  // Turn management events
  "turn:start": number;
  "turn:end": number;
  "phase:enter": string;
  "phase:exit": string;
  // Inventory events (see engine/behaviors/inventory.ts)
  "inventory:add": { entity: unknown; item: unknown; count: number };
  "inventory:remove": { entity: unknown; itemId: string; count: number };
  "inventory:full": { entity: unknown; item: unknown };
  // Equipment events (see engine/behaviors/equipment.ts)
  "equipment:equip": { entity: unknown; item: unknown; slotId: string };
  "equipment:unequip": { entity: unknown; item: unknown; slotId: string };
  // Currency events (see engine/behaviors/currency.ts)
  "currency:gained": { entity: unknown; currency: string; amount: number; reason?: string };
  "currency:spent": { entity: unknown; currency: string; amount: number; reason?: string };
  "currency:insufficient": {
    entity: unknown;
    currency: string;
    required: number;
    available: number;
    reason?: string;
  };
  // Crafting events (see engine/behaviors/crafting.ts)
  "craft:complete": {
    entity: unknown;
    recipeId: string;
    items: unknown[];
    consumed: Array<{ itemId: string; count: number }>;
    xpGained?: number;
  };
  "craft:failed": {
    entity: unknown;
    recipeId: string;
    reason: string;
    missing?: Array<{ itemId: string; count: number }>;
    consumed?: Array<{ itemId: string; count: number }>;
  };
  // Combat events (emitted by createDamageSystem — see engine/behaviors/damage.ts)
  "combat:damage-taken": {
    entity: unknown;
    amount: number;
    source?: unknown;
    type?: string;
    remainingHp: number;
  };
  "combat:entity-defeated": {
    entity: unknown;
    source?: unknown;
    type?: string;
  };
  // Viewport events (emitted by engine.viewport on resize/orientationchange)
  "viewport:resized": { width: number; height: number; orientation: "portrait" | "landscape" };
  "viewport:orientation": "portrait" | "landscape";
};

export const events = mitt<EngineEvents>();
