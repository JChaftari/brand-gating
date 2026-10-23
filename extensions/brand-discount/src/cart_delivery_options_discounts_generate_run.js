/**
  * @typedef {import("../generated/api").DeliveryInput} RunInput
  * @typedef {import("../generated/api").CartDeliveryOptionsDiscountsGenerateRunResult} CartDeliveryOptionsDiscountsGenerateRunResult
  */

/**
  * Brand discounts apply to product lines only, so this target never discounts
  * shipping. The template version of this file gave 100% off the first
  * delivery group whenever the discount had the Shipping class enabled — free
  * shipping on every cart for any merchant who ticked that box.
  *
  * @param {RunInput} _input
  * @returns {CartDeliveryOptionsDiscountsGenerateRunResult}
  */
export function cartDeliveryOptionsDiscountsGenerateRun(_input) {
  return {operations: []};
}
