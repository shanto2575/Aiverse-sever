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
    const bookmarksCollection = db.collection("bookmarks");
    const reviewsCollection = db.collection("reviews");
    const reportsCollection = db.collection("reports");

    //........user.......
    app.get('/api/user/:email', async (req, res) => {
      const { email } = req.params;
      const result = await userCollection.findOne({ email })
      res.json(result)
    })

    //......prompts......

    app.get('/api/prompts', async (req, res) => {
      const search = req.query.search;
      const category = req.query.category;
      const difficulty = req.query.difficulty;
      const aiEngine = req.query.aiEngine;
      const query = {};
      if (search) {
        query.title = {
          $regex: search,
          $options: "i"
        };
      }
      if (category) {
        // query.category = category;
        query.category = { $in: category.split(',') }
      }
      if (aiEngine) {
        query.aiEngine = aiEngine;
      }
      if (difficulty) {
        query.difficulty = difficulty;
      }
      const result = await promptsCollection.find(query).toArray()
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

    //........bookmarks....................................................

    app.post("/api/bookmarks", async (req, res) => {
      try {
        const { userEmail, promptId, prompt } = req.body;

        if (!userEmail || !promptId) {
          return res.status(400).json({ message: "Missing data" });
        }

        const exists = await bookmarksCollection.findOne({
          userEmail,
          promptId,
        });

        if (exists) {
          return res.json({ message: "Already bookmarked" });
        }

        const result = await bookmarksCollection.insertOne({
          userEmail,
          promptId,
          prompt,
          createdAt: new Date(),
        });
        const promptObjectId = new ObjectId(promptId);
        await promptsCollection.updateOne(
          { _id: promptObjectId },
          { $inc: { bookmarkCount: 1 } }
        );

        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });


    app.delete("/api/bookmarks", async (req, res) => {
      try {
        const { userEmail, promptId } = req.query;

        const result = await bookmarksCollection.deleteOne({
          userEmail,
          promptId,
        });
        if (result.deletedCount > 0) {
          await promptsCollection.updateOne(
            { _id: promptObjectId },
            {
              $inc: {
                bookmarkCount: -1
              }
            }
          );
        }

        res.json({ message: "Bookmark removed" });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/api/bookmarks/:email", async (req, res) => {
      try {
        const { email } = req.params;

        const result = await bookmarksCollection
          .find({ userEmail: email })
          .toArray();

        res.send(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });


    app.get("/api/bookmarks/:userEmail/:promptId", async (req, res) => {
      try {
        const { userEmail, promptId } = req.params;

        const bookmark = await bookmarksCollection.findOne({
          userEmail,
          promptId,
        });

        res.json({
          bookmarked: !!bookmark,
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    //...................copy..............


    app.patch("/api/prompts/copy/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const result = await promptsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $inc: {
              copies: 1
            }
          }
        );

        res.json(result);
      } catch (err) {
        res.status(500).json({
          error: err.message
        });
      }
    });


    //............reviews...................

    app.get("/api/user-reviews/:email", async (req, res) => {
      try {
        const { email } = req.params;

        const reviews = await reviewsCollection
          .find({ userEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        const totalReviews = reviews.length;

        const averageRating =
          totalReviews > 0
            ? (
              reviews.reduce((sum, r) => sum + Number(r.rating), 0) /
              totalReviews
            ).toFixed(1)
            : 0;

        res.json({
          reviews,
          totalReviews,
          averageRating: Number(averageRating),
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });


    app.get("/api/reviews/:promptId", async (req, res) => {
      try {
        const { promptId } = req.params;

        const reviews = await reviewsCollection
          .find({ promptId })
          .sort({ createdAt: -1 })
          .toArray();

        const totalReviews = reviews.length;

        const averageRating =
          totalReviews > 0
            ? (
              reviews.reduce((sum, r) => sum + Number(r.rating), 0) /
              totalReviews
            ).toFixed(1)
            : 0;

        res.json({
          reviews,
          totalReviews,
          averageRating: Number(averageRating),
        });

      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post("/api/reviews", async (req, res) => {
      try {
        const { promptId, userEmail, rating, comment, promptTitle, promptaiEngine } = req.body;

        if (!promptId || !userEmail || !rating || !comment) {
          return res.status(400).json({ message: "Missing fields" });
        }

        const promptObjectId = new ObjectId(promptId);

        const existing = await reviewsCollection.findOne({
          promptId,
          userEmail,
        });

        await reviewsCollection.updateOne(
          { promptId, userEmail },
          {
            $set: {
              rating,
              comment,
              promptTitle,
              promptaiEngine,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );

        const allReviews = await reviewsCollection
          .find({ promptId })
          .toArray();

        const totalReviews = allReviews.length;

        const averageRating =
          totalReviews > 0
            ? allReviews.reduce((sum, r) => sum + Number(r.rating), 0) /
            totalReviews
            : 0;

        await promptsCollection.updateOne(
          { _id: promptObjectId },
          {
            $set: {
              totalReviews,
              averageRating: Number(averageRating.toFixed(1)),
            },
          }
        );

        const review = await reviewsCollection.findOne({
          promptId,
          userEmail,
        });

        res.json({
          review,
          totalReviews,
          averageRating: Number(averageRating.toFixed(1)),
        });

      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });


    //......................reports............................


    app.get("/api/reports", async (req, res) => {
      try {
        const reports = await reportsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        res.json(reports);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });

    app.post("/api/reports", async (req, res) => {
      try {
        const { promptId, userEmail, reason, description } = req.body;

        if (!promptId || !userEmail || !reason) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        const reportData = {
          promptId,
          userEmail,
          reason,
          description: description || "",
          status: "pending",
          createdAt: new Date(),
        };

        const result = await reportsCollection.insertOne(reportData);

        res.status(201).json({
          message: "Report submitted successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });

    app.get("/api/reports/:promptId", async (req, res) => {
      try {
        const { promptId } = req.params;

        const reports = await reportsCollection
          .find({ promptId })
          .sort({ createdAt: -1 })
          .toArray();

        res.json(reports);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });

    app.patch("/api/reports/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        const result = await reportsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          }
        );

        res.json(result);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });

    app.delete("/api/reports/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const result = await reportsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.json(result);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });


    //............creator..............
    app.get('/api/creator-prompts/:email', async (req, res) => {
      const { email } = req.params;

      const totalPrompts = await promptsCollection.countDocuments({
        userEmail: email
      });

      const prompts = await promptsCollection.find({
        userEmail: email
      }).toArray();

      res.json({
        totalPrompts,
        prompts
      });
    });






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
