const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const User = require('../models/userSchema')

exports.register = async (req, res) => {
  try {
    const { username, email, password, role } = req.body

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Ensure only admins can set roles
    const userRole = role && ['admin', 'user', 'moderator'].includes(role) ? role : 'user'

    // Create the user
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      role: userRole, // 🔥 Store user role
    })

    res.status(201).json({ message: 'User registered successfully', user: newUser })
  } catch (error) {
    console.error('Error registering user:', error)
    res.status(500).json({ error: 'Server error' })
  }
}

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body
    const user = await User.findOne({ email })

    if (!user) return res.status(404).json({ error: 'User not found' })

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' })

    // Create JWT token including `userRole`
    const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' })

    res.json({ token, user: { id: user._id, username: user.username, role: user.role } })
  } catch (error) {
    console.error('Error logging in:', error)
    res.status(500).json({ error: 'Server error' })
  }
}
