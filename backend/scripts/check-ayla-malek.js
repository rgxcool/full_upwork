import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/User.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envFile = path.resolve(__dirname, '../.env.development');
dotenv.config({ path: envFile });

const checkAylaMalek = async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mindful';

    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Find Ayla Malek by email
        const email = 'ayla.malek@mindful.se';
        const user = await User.findOne({ email });

        if (!user) {
            console.log(`❌ User with email ${email} not found.`);
            console.log('\n📋 Searching for similar users...');
            const similarUsers = await User.find({
                $or: [
                    { email: { $regex: /ayla/i } },
                    { email: { $regex: /malek/i } },
                    { name: { $regex: /ayla/i } },
                    { name: { $regex: /malek/i } },
                ]
            }).select('email name roles');
            
            if (similarUsers.length > 0) {
                console.log(`Found ${similarUsers.length} similar users:`);
                similarUsers.forEach((u, idx) => {
                    console.log(`   ${idx + 1}. ${u.name || 'N/A'} (${u.email}) - Roles: ${JSON.stringify(u.roles)}`);
                });
            } else {
                console.log('No similar users found.');
            }
            return;
        }

        console.log(`✅ Found user: ${user.name || 'N/A'} (${user.email})`);
        console.log(`   - ID: ${user._id}`);
        console.log(`   - Roles array: ${JSON.stringify(user.roles)}`);
        console.log(`   - Primary role (virtual): ${user.role}`);
        console.log(`   - Has coordinator role: ${user.roles?.includes('coordinator') ? '✅ YES' : '❌ NO'}`);
        console.log(`   - Has teacher role: ${user.roles?.includes('teacher') ? '✅ YES' : '❌ NO'}`);
        
        // Check if coordinator is the first role
        if (user.roles && user.roles.length > 0) {
            console.log(`   - First role (primary): ${user.roles[0]}`);
            if (user.roles[0] !== 'coordinator' && user.roles.includes('coordinator')) {
                console.log(`\n⚠️  WARNING: Coordinator is not the primary role!`);
                console.log(`   The primary role is "${user.roles[0]}", which may cause filtering issues.`);
                console.log(`   Consider making coordinator the first role in the array.`);
            }
        }

        // Check if there's a Teacher record for this user
        const Teacher = mongoose.model('Teacher');
        const teacher = await Teacher.findOne({ userId: user._id });
        if (teacher) {
            console.log(`\n📚 Teacher record found:`);
            console.log(`   - Teacher ID: ${teacher._id}`);
            console.log(`   - Name: ${teacher.name || 'N/A'}`);
        } else {
            console.log(`\n📚 No Teacher record found for this user.`);
        }

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB.');
    }
};

checkAylaMalek();
