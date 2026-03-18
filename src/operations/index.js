// Export all operations
const Operation = require('../modules/Operation');
const LoginOperation = require('./LoginOperation');
const ScrapeOrdersOperation = require('./ScrapeOrdersOperation');
const AddToCartOperation = require('./AddToCartOperation');
const PrepareItemsToAddToCart = require('./PrepareItemsToAddToCart');

module.exports = {
  Operation,
  LoginOperation,
  ScrapeOrdersOperation,
  AddToCartOperation,
  PrepareItemsToAddToCart,
};
