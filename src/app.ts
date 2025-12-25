import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import './workers/notificationWorker';
import notificationRoutes from './routes/notificationRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/notifications', notificationRoutes);

app.get('/', (req, res) => {
    res.send('Notification Server is running');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
