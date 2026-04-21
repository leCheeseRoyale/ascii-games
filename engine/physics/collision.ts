/**
 * Simple collision detection. No physics response — just overlap checks.
 *
 * For full rigid-body physics, use the Rapier2D plugin (future).
 * This covers 90% of ASCII game needs: did the player touch the enemy?
 */

import type { Collider, Position } from "@shared/types";

export interface Collidable {
  position: Position;
  collider: Collider;
}

/** Check if two entities overlap. Respects collision group/mask bitmasks. */
export function overlaps(a: Collidable, b: Collidable): boolean {
  // Early out if collision groups don't match
  const ag = a.collider.group ?? 1;
  const am = a.collider.mask ?? 0xffffffff;
  const bg = b.collider.group ?? 1;
  const bm = b.collider.mask ?? 0xffffffff;
  if ((ag & bm) === 0 || (bg & am) === 0) return false;

  if (a.collider.type === "circle" && b.collider.type === "circle") {
    return circleCircle(a, b);
  }
  if (a.collider.type === "rect" && b.collider.type === "rect") {
    return rectRect(a, b);
  }
  // Mixed: proper circle-rect intersection
  if (a.collider.type === "circle" && b.collider.type === "rect") {
    return circleRect(a, b);
  }
  return circleRect(b, a);
}

function circleCircle(a: Collidable, b: Collidable): boolean {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  const r = (a.collider.width + b.collider.width) / 2;
  return dx * dx + dy * dy < r * r;
}

function rectRect(a: Collidable, b: Collidable): boolean {
  const ahw = a.collider.width / 2,
    ahh = a.collider.height / 2;
  const bhw = b.collider.width / 2,
    bhh = b.collider.height / 2;
  return (
    a.position.x - ahw < b.position.x + bhw &&
    a.position.x + ahw > b.position.x - bhw &&
    a.position.y - ahh < b.position.y + bhh &&
    a.position.y + ahh > b.position.y - bhh
  );
}

function circleRect(circle: Collidable, rect: Collidable): boolean {
  const cx = circle.position.x;
  const cy = circle.position.y;
  const r = circle.collider.width / 2;
  const rx = rect.position.x;
  const ry = rect.position.y;
  const rhw = rect.collider.width / 2;
  const rhh = rect.collider.height / 2;
  // Find closest point on rect to circle center
  const closestX = Math.max(rx - rhw, Math.min(cx, rx + rhw));
  const closestY = Math.max(ry - rhh, Math.min(cy, ry + rhh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < r * r;
}

/** Check one entity against a list, return all overlapping. */
export function overlapAll<T extends Collidable>(entity: Collidable, others: Iterable<T>): T[] {
  const result: T[] = [];
  for (const o of others) {
    if (o !== entity && overlaps(entity, o)) result.push(o);
  }
  return result;
}
