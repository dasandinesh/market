const express = require('express');
const router = express.Router();
const productController = require('../controllers/productcontroller');

// Create a new product
router.post('/',  productController.createProduct);

// Get all products
router.get('/', productController.getProducts);

// Get a product by ID
router.get('/:id', productController.getProductById);

// Update a product by ID
router.put('/:id', productController.updateProduct);

// Delete a product by ID
router.delete('/:id', productController.deleteProduct);

module.exports = router;