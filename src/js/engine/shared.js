'use strict';
// View-distance constants from CONFIG, the hash2 grid hash and the ITEMS registry shared by the 3D engine.
const REDUCED_MOTION = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
if (REDUCED_MOTION) { CONFIG.windSway = 0; CONFIG.fishRises = false; }   // the system asks for less motion: still trees, no rise rings; the water and camera still move with you
const FOV = CONFIG.fieldOfView * Math.PI / 180, FAR = CONFIG.viewDistance, EYE = CONFIG.eyeHeight;
const CHW = CHK * SP;                 // terrain chunk width in world units
const VIEW = CONFIG.terrainChunkRadius, TREE_VIEW = CONFIG.treeChunkRadius;
const TREE_GRID = CONFIG.treeSpacing;
const hash2 = (x, y, s) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + s | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
const ITEMS = {}; // filled by Game.registerItem
