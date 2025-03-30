require('dotenv').config(); // Load environment variables from .env
console.log("Google Client ID:", process.env.GOOGLE_CLIENT_ID);

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cors = require('cors');

const app = express();
const PORT = 3000;

// --- Middleware Setup --- //
// Allow requests from both localhost:5500 and 127.0.0.1:5500
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500'],
  credentials: true
}));

app.use(express.json());

// Setup express-session using secret from .env
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

// Initialize Passport and session support
app.use(passport.initialize());
app.use(passport.session());

// --- MongoDB Setup --- //
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// --- Define Product Schema & Model --- //
const productSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  description: String,
  price: Number,
  location: String,
  productPicture: String, // e.g., "uploads/filename.jpg"
  category: String
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

// --- Define User Schema & Model --- //
const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  displayName: String,
  firstName: String,
  lastName: String,
  image: String,
  email: String
});
const User = mongoose.model('User', userSchema);

// --- Passport Google OAuth Configuration --- //
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,             // Loaded from .env
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,       // Loaded from .env
    callbackURL: process.env.GOOGLE_CALLBACK_URL          // Loaded from .env
  },
  async (accessToken, refreshToken, profile, done) => {
    // Build a new user object from profile info
    const newUser = {
      googleId: profile.id,
      displayName: profile.displayName,
      firstName: profile.name.givenName,
      lastName: profile.name.familyName,
      image: profile.photos && profile.photos[0].value,
      email: profile.emails && profile.emails[0].value
    };

    try {
      let user = await User.findOne({ googleId: profile.id });
      if (user) {
        done(null, user);
      } else {
        user = await User.create(newUser);
        done(null, user);
      }
    } catch (err) {
      console.error(err);
      done(err, null);
    }
  }
));

// --- Passport Serialize/Deserialize --- //
passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// --- Routes --- //

// Start Google OAuth flow
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google OAuth callback
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login-failure' }),
  (req, res) => {
    // Successful authentication: redirect to front-end
    res.redirect('http://localhost:5500');
  }
);

// Logout route
app.get('/auth/logout', (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('http://localhost:5500');
  });
});

// Check authentication status: returns user data if logged in
app.get('/auth/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.json({ user: null });
  }
});

// NEW: GET endpoint to fetch products with optional filtering
app.get('/api/products', async (req, res) => {
  try {
    const filter = {};
    // Filter by search query on productName
    if (req.query.search) {
      filter.productName = { $regex: req.query.search, $options: 'i' };
    }
    // Filter by location if provided (assuming your product document contains a "location" field)
    if (req.query.location) {
      filter.location = req.query.location;
    }
    // Optionally, you can also filter by category if needed:
    if (req.query.category) {
      filter.category = req.query.category;
    }
    const products = await Product.find(filter);
    res.json(products);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Start the Server --- //
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
