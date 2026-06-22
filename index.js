const dns = require('node:dns');
dns.setServers(['1.1.1.1', '1.0.0.1']);

const express = require("express");
const dontenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dontenv.config();

const uri = process.env.MONGODB_URI;

const app = express();
const PORT = process.env.PORT;

app.use(
  cors({
    credentials: true,
    origin: [process.env.CLIENT_URL],
  }),
);
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});




async function run() {
  try {
    await client.connect();
    const db = client.db("Aiverse");
    const promptsCollection = db.collection("prompts");
    const userCollection = db.collection('user')
    const subscriptionsCollection = db.collection('payments')

    //........user.......
    app.get('/api/user', async (req, res) => {
      const result = await userCollection.find()
    })

    //......prompts......

    app.get('/api/prompts', async (req, res) => {
      const result = await promptsCollection.find().toArray()
      res.json(result)
    })
    app.get('/api/single-prompts/:id', async (req, res) => {
      const { id } = req.params;
      const result = await promptsCollection.findOne({ _id: new ObjectId(id) })
      res.json(result)
    })

    app.get('/api/prompts/:email', async (req, res) => {
      const { email } = req.params;
      const result = await promptsCollection.find({ userEmail: email }).toArray()
      res.json(result)
    })

    app.post("/api/prompts", async (req, res) => {
      const data = req.body;
      // console.log(data)
      const user = await userCollection.findOne({ email: data?.userEmail })
      // console.log(user)
      const userPromptsCount = await promptsCollection.countDocuments({ userEmail: data?.userEmail })
      // console.log(userPromptsCount)
      if (!user) {
        return res.status(404).send({ msg: "User not found" });
      }

      if (user.plan !== 'pro' && userPromptsCount >= 3) {
        return res.status(401).send({ msg: 'Your Free Limit is Over!' })
      }
      const promptData = {
        ...data,
        createdAt: new Date()
      };
      const result = await promptsCollection.insertOne(promptData);
      
      await userCollection.updateOne(
        { email: data?.userEmail },
        {
          $inc: { promptCount: 1 }
        }
      );
      res.json(result);
    });

    app.patch('/api/prompts/:id', async (req, res) => {
      const { id } = req.params;
      const data = req.body;
      const result = await promptsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            ...data,
          }
        }
      )
      res.json(result)
    })

    app.delete('/api/prompts/:id', async (req, res) => {
      const { id } = req.params;
      const result = await promptsCollection.deleteOne({ _id: new ObjectId(id) })
      res.json(result)
    })

    app.post('/subscriptions', async (req, res) => {
      const { sessionId, userId, priceId, userEmail, userName } = req.body;

      const isExist = await subscriptionsCollection.findOne({ sessionId })
      if (isExist) {
        return res.json({ msg: 'already Exists' })
      }
      await subscriptionsCollection.insertOne({
        sessionId,
        priceId,
        userId,
        userEmail,
        userName,
        Amouts: 5,
        date: new Date()
      })
      await userCollection.updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            plan: 'pro'
          }
        }
      )
      res.json({ msg: 'payments Successful' })
    })



    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running fine!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
