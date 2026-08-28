/**
 * Governed tool registry bootstrap.
 * Register only explicit tools here — agents cannot invent tools at runtime.
 */
import { registerTool } from '../tool-registry.js';
import {
  analyticsReadTool,
  inventoryReadTool,
  ordersReadTool,
  productInspectTool,
  productsSearchTool,
} from './vura-read.js';
import { webSearchTool } from './web-search.js';

let registered = false;

export function registerBuiltinTools() {
  if (registered) return;
  registered = true;

  // READ tools — no approval required by default policy
  registerTool(productsSearchTool);
  registerTool(productInspectTool);
  registerTool(inventoryReadTool);
  registerTool(ordersReadTool);
  registerTool(analyticsReadTool);
  registerTool(webSearchTool);
}

export function listRegisteredToolNames() {
  registerBuiltinTools();
  // list via policy-agnostic re-export path
  return [
    productsSearchTool.name,
    productInspectTool.name,
    inventoryReadTool.name,
    ordersReadTool.name,
    analyticsReadTool.name,
    webSearchTool.name,
  ];
}
