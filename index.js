const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const multer = require("multer");
const bodyParser = require("body-parser");
const path = require("path");
const app = express();
const crypto = require("crypto");
const { log } = require("console");
const PORT = 8181;
app.use(bodyParser.urlencoded({ extended: true }));

// Create a MySQL connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "gp1",
});

// Connect to MySQL
db.connect((err) => {
  if (err) {
    throw err;
  }
  console.log("MySQL connected");
});
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Multer for handling file uploads

const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    cb(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});
const upload = multer({ storage: storage });

// 'image' is the name attribute in the form data for the file input
const uploadFolder = path.join(__dirname, "uploads");

// Enable CORS

app.get("/dh/c4", (req, res) => {
  const sql = "SELECT COUNT(*) AS idCount FROM customer";
  const sql2 = "SELECT COUNT(*) AS pCount FROM Productlist";

  db.query(sql, (err, result1) => {
    if (err) {
      res.status(500).send("Error counting IDs");
    } else {
      const idCount = result1[0].idCount;

      db.query(sql2, (err2, result2) => {
        if (err2) {
          res.status(500).send("Error counting products");
        } else {
          const pCount = result2[0].pCount;
          res.json({ ucount: idCount, pCount: pCount });
        }
      });
    }
  });
});

// Define routes
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.get("/api/transactions/monthly", async (req, res) => {
  try {
    const query = `
      SELECT 
        DATE_FORMAT(Date, '%Y-%m') AS month,
        SUM(Total) AS total_revenue
      FROM transaction
      GROUP BY month
      ORDER BY month
    `;
    db.query(query, (err, rows) => {
      if (err) {
        console.error("Error fetching monthly transaction data:", err);
        res.status(500).send("Error fetching data");
      } else {
        res.json(rows);
      }
    });
  } catch (error) {
    console.error("Error fetching monthly transaction data:", error);
    res.status(500).send("Error fetching data");
  }
});
app.get("/api/transactions/category", (req, res) => {
  const query = `
    SELECT 
      DATE_FORMAT(t.Date, '%Y-%m') AS month,
      p.Category AS category,
      SUM(td.q * p.Price) AS total_revenue
    FROM transaction t
    JOIN transaction_details td ON t.t_id = td.t_id
    JOIN productlist p ON td.p_id = p.p_id
    GROUP BY month, category
    ORDER BY month, category
  `;

http: db.query(query, (err, rows) => {
  if (err) {
    console.error("Error fetching monthly transaction data:", err);
    res.status(500).send("Error fetching data");
    return;
  }
  res.json(rows);
});
});
app.get("/api/transactions/all", (req, res) => {
  const query = `
    SELECT SUM(Total) AS total_sales
    FROM transaction;
  `;

  db.query(query, (error, results) => {
    if (error) {
      console.error("Error fetching total sales:", error);
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    const totalSales = results[0].total_sales || 0;
    res.json({ totalSales });
  });
});

app.get("/api/top-products", (req, res) => {
  const query = `
    SELECT 
      p.P_id,
      p.P_name,
      p.category,
      p.Price,
      p.P_img,
      SUM(td.q) AS total_sold
    FROM productlist p
    JOIN transaction_details td ON p.p_id = td.p_id
    GROUP BY p.p_id
    ORDER BY total_sold DESC
    LIMIT 5
  `;

  db.query(query, (err, rows) => {
    if (err) {
      console.error("Error fetching top products:", err);
      res.status(500).send("Error fetching data");
      return;
    }
    res.json(rows);
  });
});


// API endpoint to get recommendations for a user

// API endpoint to get recommendations for a user
function calculateDistance(user1, user2) {
  let distance = 0;
  for (const item in user1) {
    if (user2[item]) {
      distance += Math.pow(user1[item] - user2[item], 2);
    }
  }
  return Math.sqrt(distance);
}

app.get("/recommendations/:userId", (req, res) => {
  const userId = req.params.userId;

  // Query to fetch all reviews for all users
  const query = `SELECT CustomerID, P_id, Rate FROM customer_review_productlist`;

  // Execute the SQL query
  db.query(query, (error, results) => {
    if (error) {
      console.error("Error fetching reviews:", error);
      return res.status(500).json({ error: "Internal server error" });
    }

    // Create a map to store ratings for each user
    const userRatings = {};

    // Iterate over the fetched reviews
    results.forEach((review) => {
      const uid = review.CustomerID;
      const iid = review.P_id;
      const rating = review.Rate;

      // Create an object to store ratings for each item by each user
      if (!userRatings[uid]) {
        userRatings[uid] = {};
      }

      // Store the rating for the item by the user
      userRatings[uid][iid] = rating;
    });

    // Check if the target user has any ratings
    if (!userRatings[userId] || Object.keys(userRatings[userId]).length === 0) {
      // If the user has no ratings, send random 4 products
      const randomProductQuery = `SELECT * FROM productlist ORDER BY RAND() LIMIT 4`;

      db.query(randomProductQuery, (randomError, randomResults) => {
        if (randomError) {
          console.error("Error fetching random products:", randomError);
          return res.status(500).json({ error: "Internal server error" });
        }
        return res.json(randomResults);
      });
      return;
    }

    // Find the most similar user to the target user
    let mostSimilarUser = null;
    let minDistance = Infinity;

    Object.keys(userRatings).forEach((otherUserId) => {
      if (otherUserId !== userId) {
        // Calculate the distance between the target user and the current user
        const distance = calculateDistance(
          userRatings[userId],
          userRatings[otherUserId]
        );

        // Update the most similar user if the current user is closer to the target user
        if (distance < minDistance) {
          minDistance = distance;
          mostSimilarUser = otherUserId;
        }
      }
    });

    // Once the most similar user is found, suggest items to the target user that they have not rated but the most similar user has
    const suggestedItems = [];

    if (mostSimilarUser) {
      Object.keys(userRatings[mostSimilarUser]).forEach((itemId) => {
        if (!userRatings[userId][itemId]) {
          // If the target user hasn't rated the item, suggest it based on the most similar user's rating
          suggestedItems.push(itemId);
        }
      });
    }

    // Limit the number of suggested items to 4 or less
    const limitedSuggestedItems = suggestedItems.slice(0, 4);

    if (limitedSuggestedItems.length === 0) {
      // If no suggestions from the most similar user, send random 4 products
      const randomProductQuery = `SELECT * FROM productlist ORDER BY RAND() LIMIT 4`;

      db.query(randomProductQuery, (randomError, randomResults) => {
        if (randomError) {
          console.error("Error fetching random products:", randomError);
          return res.status(500).json({ error: "Internal server error" });
        }
        return res.json(randomResults);
      });
      return;
    }

    // Query to fetch product data and average ratings for suggested items
    const productQuery = `
      SELECT 
        p.*, 
        AVG(r.Rate) AS average_rating 
      FROM 
        productlist p 
        LEFT JOIN customer_review_productlist r ON p.P_id = r.P_id 
      WHERE 
        p.P_id IN (${limitedSuggestedItems
          .map((item) => `'${item}'`)
          .join(",")})
      GROUP BY 
        p.P_id
    `;

    // Execute the SQL query to fetch product data and ratings
    db.query(productQuery, (productError, productResults) => {
      if (productError) {
        console.error("Error fetching product data:", productError);
        return res.status(500).json({ error: "Internal server error" });
      }
      // Send the suggested items and corresponding product data as a JSON response
      res.json(productResults);
    });
  });
});




app.get("/admin/customers", (req, res) => {
  const query = `
    SELECT c.UserId, c.UserName, a.Ban_State
    FROM customer c
    LEFT JOIN admin_customer a ON c.UserId = a.CustomerID
  `;

  db.query(query, (error, results) => {
    if (error) {
      console.error("Error fetching customers:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
    res.json(results);
  });
});

// Ban/unban a customer
app.post("/admin/customers/ban", (req, res) => {
  const { CustomerID, Ban_State } = req.body;

  const query = `
    INSERT INTO admin_customer (AdminID,CustomerID, Ban_State)
    VALUES (1,?, ?)
    ON DUPLICATE KEY UPDATE Ban_State = VALUES(Ban_State)
  `;

  db.query(query, [CustomerID, Ban_State], (error, results) => {
    if (error) {
      console.error("Error updating ban state:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
    res.json({ message: "Ban state updated successfully" });
  });
});

// Delete a customer (optional)
app.delete("/admin/customers/:CustomerID", (req, res) => {
  const { CustomerID } = req.params;

  const query = `
    DELETE FROM customer WHERE UserId = ?
  `;

  db.query(query, [CustomerID], (error, results) => {
    if (error) {
      console.error("Error deleting customer:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
    res.json({ message: "Customer deleted successfully" });
  });
});






app.get("/pcrud", (req, res) => {
  const sql =
    "SELECT P_id, P_img, p_name, category, quantity, price FROM productlist";

  db.query(sql, (error, results) => {
    if (error) {
      // ... error handling
    } else {
      if (results.length > 0) {
        const products = results.map((product) => ({
          P_img: product.P_img,
          P_id: product.P_id, // Send the image path as-is
          p_name: product.p_name,
          category: product.category,
          quantity: product.quantity,
          price: product.price,
        }));

        res.status(200).json({ products });
      } else {
        // ... handle no products found
      }
    }
  });
});
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.post("/AD", (req, res) => {
  const { email, password } = req.body;

  // Query to check if user exists in the database using prepared statement
  const sql =
    "SELECT COUNT(*) AS count FROM admin WHERE Email = ? AND Password = ?";
  db.query(sql, [email, password], (err, result) => {
    if (err) {
      res.status(500).send("Error checking user existence");
    } else {
      const userExists = result[0].count > 0;
      res.json({ exists: userExists });
    }
  });
});

app.post("/addP", upload.single("image"), async (req, res) => {
  try {
    const uploadedFile = req.file;

    if (!uploadedFile) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    const { productName, price, quantity, category, description } = req.body; // Access product data from request body

    // Construct the INSERT query with placeholders for all values
    const insertQuery = `INSERT INTO productlist (P_name, price, quantity, category, description, p_img) VALUES (?, ?, ?, ?, ?, ?)`;

    // Execute the query, passing all values as an array
    await db.query(insertQuery, [
      productName,
      price,
      quantity,
      category,
      description,
      uploadedFile.filename,
    ]);

    res.status(201).json({ message: "Product added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error adding product" });
  }
});
app.delete("/deleteProduct/:productId", (req, res) => {
  const productId = req.params.productId;

  const sql = "DELETE FROM productlist WHERE P_id = ?";

  db.query(sql, [productId], (error, result) => {
    if (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Error deleting product" });
    } else {
      if (result.affectedRows > 0) {
        res.status(200).json({ message: "Product deleted successfully" });
      } else {
        res.status(404).json({ message: "Product not found" });
      }
    }
  });
});

app.put("/updateProduct/:productId", upload.single("image"), (req, res) => {
  const productId = req.params.productId;
  const { productName, price, quantity, category, description } = req.body;
  let imgPath = "";

  if (req.file) {
    imgPath = req.file.filename; // Get the uploaded image filename
  }

  const sql =
    "UPDATE productlist SET P_img = ?, P_name = ?, price = ?, Quantity = ?, category = ?, description = ? WHERE P_id = ?";

  db.query(
    sql,
    [imgPath, productName, price, quantity, category, description, productId],
    (error, result) => {
      if (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ message: "Error updating product" });
      } else {
        if (result.affectedRows > 0) {
          res.status(200).json({ message: "Product updated successfully" });
        } else {
          res.status(404).json({ message: "Product not found" });
        }
      }
    }
  );
});
// the user backend
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  // Check if the user exists in the database
  const query = "SELECT * FROM customer WHERE Email = ? AND Password = ?";
  db.query(query, [email, password], (error, results) => {
    if (error) {
      console.error("Error executing MySQL query:", error);
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    if (results.length > 0) {
      // User found, send success response
      res.status(200).json({ message: "Login successful", user: results[0] });
    } else {
      // User not found or credentials don't match
      res.status(401).json({ error: "Invalid credentials" });
    }
  });
});
app.get("/Plist", (req, res) => {
  const sql = `
    SELECT 
      p.P_img, 
      p.p_name, 
      p.category, 
      p.quantity, 
      p.price, 
      p.P_id, 
      AVG(r.Rate) AS rating 
    FROM 
      productlist p 
      LEFT JOIN customer_review_productlist r ON p.P_id = r.P_id 
    GROUP BY 
      p.P_id
  `;

  db.query(sql, (error, results) => {
    if (error) {
      console.error("Error executing SQL query:", error);
      res.status(500).json({ error: error.message });
    } else {
      if (results.length > 0) {
        const products = results.map((product) => ({
          P_img: product.P_img.toString("base64"), // Convert image buffer to base64
          p_name: product.p_name,
          P_id: product.P_id,
          category: product.category,
          quantity: product.quantity,
          price: product.price,
          rating: product.rating || 0, // Set rating to 0 if it's null
        }));
        res.status(200).json({ products });
      } else {
        res.status(404).json({ message: "No products found" });
      }
    }
  });
});

app.get("/product/:pId", (req, res) => {
  const productId = req.params.pId; // Get the product ID from the request params

  // Query to fetch product details from MySQL based on productId
  const sql = "SELECT * FROM productlist WHERE P_id = ?"; // Replace 'products' with your actual table name
  db.query(sql, [productId], (err, result) => {
    if (err) {
      res.status(500).json({ error: "Error fetching product details" });
    } else {
      if (result.length > 0) {
        res.status(200).json(result[0]); // Send the product details as JSON
      } else {
        res.status(404).json({ message: "Product not found" });
      }
    }
  });
});
// ... previous code remains the same ...
app.post("/cart/add", (req, res) => {
  const { userId, productIds } = req.body;

  if (!userId || !Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ error: "Invalid user ID or products data" });
  }

  db.beginTransaction((err) => {
    if (err) {
      return res.status(500).json({ error: "Transaction begin error" });
    }

    db.query(
      "SELECT P_id FROM productlist WHERE P_id IN (?)",
      [productIds],
      (err, productResult) => {
        if (err) {
          return db.rollback(() => {
            console.error("Error finding products:", err);
            res.status(500).json({ error: "Error finding products" });
          });
        }

        const existingProductIds = productResult.map((product) => product.P_id);

        const notFoundProducts = productIds.filter(
          (id) => !existingProductIds.includes(id)
        );

        if (notFoundProducts.length > 0) {
          return db.rollback(() => {
            res.status(404).json({
              error: `Products not found: ${notFoundProducts.join(", ")}`,
            });
          });
        }

        db.query(
          "INSERT INTO cart (CustomerID) VALUES (?)",
          [userId],
          (err, insertResult) => {
            if (err) {
              return db.rollback(() => {
                console.error("Error creating cart:", err);
                res.status(500).json({ error: "Error creating cart" });
              });
            }
            const cartId = insertResult.insertId;

            const values = productIds.map((productId) => [cartId, productId]);

            db.query(
              "INSERT INTO cart_productlist (CartID, P_id) VALUES ?",
              [values],
              (err, addToCartResult) => {
                if (err) {
                  return db.rollback(() => {
                    console.error("Error adding products to cart:", err);
                    res
                      .status(500)
                      .json({ error: "Error adding products to cart" });
                  });
                }
                db.commit((err) => {
                  if (err) {
                    return db.rollback(() => {
                      console.error("Error committing transaction:", err);
                      res
                        .status(500)
                        .json({ error: "Error committing transaction" });
                    });
                  }
                  res
                    .status(200)
                    .json({ message: "Products added to cart successfully" });
                });
              }
            );
          }
        );
      }
    );
  });
});
// Endpoint to fetch user's cart items with product details including price
app.get("/cart/:userId", (req, res) => {
  const userId = req.params.userId;
  const query = `
    SELECT cart.*, productlist.*
    FROM cart
    INNER JOIN cart_productlist ON cart.Cart_id = cart_productlist.CartID
    INNER JOIN productlist ON cart_productlist.P_id = productlist.P_id
    WHERE cart.CustomerID = ?
  `;

  db.query(query, [userId], (error, results) => {
    if (error) {
      console.error("Error fetching cart items:", error);
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    // Assuming there's only one quantity to be decremented per product in the cart
    results.forEach((cartItem) => {
      const productId = cartItem.P_id;
      const updateQuery = `
        UPDATE productlist
        SET Quantity = Quantity - 1
        WHERE P_id = ?
      `;

      db.query(updateQuery, [productId], (updateError, updateResults) => {
        if (updateError) {
          console.error("Error updating product quantity:", updateError);
          return;
        }
        console.log("Quantity decremented for product:", productId);
      });
    });

    res.json({ cartItems: results });
  });
});

app.get("/customers/:customerId", (req, res) => {
  const UserId = req.params.customerId;

  const query = "SELECT * FROM customer WHERE UserId = ?"; // Modify query as per your schema

  db.query(query, [UserId], (error, results) => {
    if (error) {
      console.error("Error fetching customer data:", error);
      res.status(500).json({ error: "Internal server error" });
      return;
    }
    res.json({ customer: results[0] }); // Assuming one customer is fetched based on the ID
  });
});

app.post("/USignup", (req, res) => {
  const { email, password, rePassword, name, address } = req.body;

  // Assuming you've established a MySQL connection
  const sql = `INSERT INTO Customer (Email, Password, UserName, Address) VALUES (?, ?, ?, ?)`;
  db.query(sql, [email, password, name, address], (err, results) => {
    if (err) {
      console.error("Error inserting data:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
    return res
      .status(200)
      .json({ message: "Form data submitted successfully" });
  });
});


app.post("/checkEmail", (req, res) => {
  const { email } = req.body;

  // Query to check if the email exists in the database
  const query = "SELECT * FROM customer WHERE Email = ?";
  db.query(query, [email], (err, results) => {
    if (err) {
      res.status(500).send("Database error");
    } else {
      if (results.length > 0) {
        res.json({ exists: true }); // Email exists in the database
      } else {
        res.json({ exists: false }); // Email does not exist in the database
      }
    }
  });
});
app.get("/p/rate", (req, res) => {
  const productId = req.query.productId; // Get the product ID from the query parameters
  const sql = `
    SELECT crp.*, c.UserName, crp.review_date 
    FROM customer_review_productlist crp
    INNER JOIN customer c ON crp.CustomerID = c.UserId
    WHERE crp.P_id = ?
  `;

  db.query(sql, [productId], (error, results) => {
    if (error) {
      console.error("Error fetching reviews:", error);
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.json({ reviews: results });
    }
  });
});
app.post("/p/rate", (req, res) => {
  const { productId, userId, rating, comment } = req.body; // Destructure the review details from the request body

  const sql = `
    INSERT INTO customer_review_productlist (P_id, CustomerID, Rate, Comment, review_date)
    VALUES (?, ?, ?, ?, NOW())
  `;

  const values = [productId, userId, rating, comment];

  db.query(sql, values, (error, results) => {
    if (error) {
      console.error("Error inserting review:", error);
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.status(201).json({ message: "Review submitted successfully" });
    }
  });
});

// Assuming you have already configured your Express app and MySQL database connection

// Define a route to handle fetching purchase history for a specific user
// Define a route to handle fetching purchase history for a specific user
app.get("/api/purchase-history/:userId", (req, res) => {
  const userId = req.params.userId;

  // Assuming you have tables named "transaction", "transaction_details", and "productlist" in your database
  const query = `
    SELECT t.customer_id, t.T_id, td.p_id, t.Total, t.Date, p.*
    FROM transaction t
    JOIN transaction_details td ON t.T_id = td.T_id
    JOIN productlist p ON td.p_id = p.p_id
    WHERE t.customer_id = ?;
  `;

  db.query(query, [userId], (error, results) => {
    if (error) {
      console.error("Error fetching purchase history:", error);
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    res.json(results);
  });
});


// Assuming you're using some sort of backend framework like Express.js
app.post("/placeOrder", (req, res) => {
  try {
    const userId = req.body.userId;
    const cartItems = req.body.cartItems;

    if (!userId || !Array.isArray(cartItems) || cartItems.length === 0) {
      console.error("Invalid request data");
      res.status(400).send("Invalid request data");
      return;
    }

    let totalPrice = 0;
    const transactionItems = [];

    // Step 1: Calculate Total Price of Cart Products and Prepare Transaction Items
    cartItems.forEach((item) => {
      if (!item.P_id || !item.Price) {
        console.error("Invalid cart item data");
        res.status(400).send("Invalid cart item data");
        return;
      }

      totalPrice += parseFloat(item.Price);

      // Set the quantity to 1 for each item
      transactionItems.push([item.P_id, 1]);
    });

    // Step 2: Create a New Transaction Record
    db.beginTransaction((err) => {
      if (err) {
        console.error("Error beginning transaction:", err);
        res.status(500).send("Error placing order");
        return;
      }

      db.query(
        "INSERT INTO transaction (Total, Date, customer_id, p_id) VALUES (?, NOW(), ?, ?)",
        [totalPrice.toFixed(2), userId, cartItems[0].P_id], // Assuming you want to use the first product ID, you may need to adjust this logic based on your requirements
        (error, result) => {
          if (error) {
            db.rollback(() => {
              console.error("Error creating transaction record:", error);
              res.status(500).send("Error placing order");
            });
            return;
          }

          const transactionId = result.insertId;

          // Step 3: Insert Transaction Details
          const sql =
            "INSERT INTO transaction_details (t_id, p_id, q) VALUES ?";
          db.query(
            sql,
            [transactionItems.map((item) => [transactionId, item[0], item[1]])],
            (error) => {
              if (error) {
                db.rollback(() => {
                  console.error("Error inserting transaction details:", error);
                  res.status(500).send("Error placing order");
                });
                return;
              }

              // Step 4: Remove Items from Cart
              db.query(
                "DELETE FROM cart_productlist WHERE CartID IN (SELECT Cart_id FROM cart WHERE CustomerID = ?)",
                [userId],
                (error) => {
                  if (error) {
                    db.rollback(() => {
                      console.error("Error removing items from cart:", error);
                      res.status(500).send("Error placing order");
                    });
                    return;
                  }

                  // Step 5: Commit Transaction
                  db.commit((err) => {
                    if (err) {
                      db.rollback(() => {
                        console.error("Error committing transaction:", err);
                        res.status(500).send("Error placing order");
                      });
                      return;
                    }

                    res.status(200).send("Order placed successfully");
                  });
                }
              );
            }
          );
        }
      );
    });
  } catch (error) {
    console.error("Error placing order:", error);
    res.status(500).send("Error placing order: " + error.message);
  }
});













app.get("/p/user-rated", (req, res) => {
  const { productId, userId } = req.query;

  if (!productId || !userId) {
    return res.status(400).json({ error: "Missing productId or userId" });
  }

  const sql =
    "SELECT COUNT(*) as count FROM customer_review_productlist WHERE P_id = ? AND CustomerID = ?";
  db.query(sql, [productId, userId], (err, result) => {
    console.log(result);
    if (err) {
      console.error("Error checking if user rated:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const alreadyRated = result[0].count > 0;
    res.json({ alreadyRated });
  });
});



// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
