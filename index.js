const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require('stripe')(process.env.PAYMENT_KEY)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 5000;


// middleware

app.use(cors())
app.use(express.json())




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.e9onx31.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});




async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();


    const menuCollection = client.db("BistroBoss").collection("menu")
    const userCollection = client.db("BistroBoss").collection("users")
    const reviewCollection = client.db("BistroBoss").collection("reviews")
    const cartCollection = client.db("BistroBoss").collection("cart")
    const paymentCollection = client.db("BistroBoss").collection("payments")

    // our own middlewares

    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ massage: 'Unauthorized Access' })
      }
      const token = req.headers.authorization.split(' ')[1] 
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ massage: 'Unauthorized Access' })
        }
        req.decoded = decoded;
        next()
      })
    }


    // use verifyAdmin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email
      const query = { email: email }
      const user = await userCollection.findOne(query)
      const isAdmin = user?.role === "admin"
      if (!isAdmin) {
        return res.status(401).send({ massage: 'Unauthorized Access' })
      }
      next()

    }

    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
      res.send({ token })
    })





    // user related api

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray()
      res.send(result)
    })



    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email 
      if (email !== req.decoded.email) {
        return res.status(403).send({ massage: 'Forbidden Access' })
      }

      const query = { email: email }
      const result = await userCollection.findOne(query)

      let admin = false;

      if (result) {
        admin = result?.role === 'admin'
      }

      res.send({ admin })

    })





    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const isExist = await userCollection.findOne(query)
      if (isExist) {
        return res.send({ massage: 'user already exist' })
      }
      const result = await userCollection.insertOne(user)
      res.send(result)
    })

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc)
      res.send(result)
    })


    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query)
      res.send(result)
    })




    // menu related api

    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray()
      res.send(result)
    })

    app.get('/menuItem/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await menuCollection.findOne(query)
      res.send(result);
    })


    app.patch('/menu/:id', async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
          image: item.image
        }
      }
      const result = await menuCollection.updateOne(filter, updatedDoc)
      res.send(result)
    })


    app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item)
      res.send(result)
    })

    app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await menuCollection.deleteOne(query)
      res.send(result)
    })

    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray()
      res.send(result)
    })

    // cart collection operation 
    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray()
      res.send(result)
    })

    app.post('/carts', async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem)
      res.send(result)
    })

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await cartCollection.deleteOne(query)
      res.send(result)
    })


    // source:(https://stripe.com/docs/payments/quickstart)
    // path: stripeDocs/payment/quickStart 
    // generate payment secure key from server to client
    /* ---------PAYMENT--------- */
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body 
      const amount = parseInt(price * 100) 
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        // ------------*************---------------
        // most important thing which we include from ourselves
        // source: (https://stripe.com/docs/api/payment_intents/object)
        // path: stripDocs/payment/quickStart/Create a PaymentIntent link
        payment_method_types: ['card']
        
      })
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })


    // save payment details data in database
    app.post('/payments', async(req, res) =>{
      const paymentDetails = req.body;
      const paymentResult = await paymentCollection.insertOne(paymentDetails) 

      // carefully delate all items from user cart
      const query = {_id: {
        $in: paymentDetails.cartIds.map(id => new ObjectId(id))
      }}

      const deleteResult = await cartCollection.deleteMany(query)

      res.send({paymentResult, deleteResult})

    })

    app.get('/payments/:email', verifyToken, async(req, res) =>{
      const email = req.params.email
      const query = {email: email}
      if(email !== req.decoded.email){
        return res.status(403).send({massage: 'forbidden access'})
      }
      const result = await paymentCollection.find(query).toArray()
      res.send(result)
    })


    // get data for admin home
    app.get('/admin-state', verifyToken, verifyAdmin, async(req, res) =>{
      const totalUser = await userCollection.estimatedDocumentCount()
      const totalMenu = await menuCollection.estimatedDocumentCount();
      const totalOrder = await paymentCollection.estimatedDocumentCount();

      // get revenue
      const result = await paymentCollection.aggregate([
        {
          $group: {
            _id: null,
            revenue: {
              $sum: '$price'
            }
          }
        }
      ]).toArray()

      const totalRevenue = result.length > 0 ? result[0].revenue : 0;
      res.send({ totalUser, totalMenu, totalOrder, totalRevenue })
    })


    





    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);







app.get('/', (req, res) => {
  res.send('Boss is coming')
})

app.listen(port, () => {
  console.log(`Boss is coming on port: ${port}`)
})
