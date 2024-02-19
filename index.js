const express = require('express')
const app = express()
const jwt = require('jsonwebtoken')
const cors = require('cors')
require('dotenv').config()
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);
const nodemailer = require('nodemailer')


//middleware
app.use(cors())
app.use(express.json())


const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    // bearer token
    const token = authorization.split(' ')[1]

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res
                .status(401)
                .send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded
        next()
    })
};

// send Mail function
const sendMail = (emailData, emailAddress) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL,
          pass: process.env.PASS
        }
      });
      const mailOptions = {
        from: process.env.EMAIL,
        to: emailAddress,
        subject: emailData.subject,
        html: `<p>${emailData?.message}</p>`
      };

      transporter.sendMail(mailOptions, function(error, info){
        if (error) {
       console.log(error);
        } else {
          console.log('Email sent: ' + info.response);
          // do something useful
        }
      });

}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zzcfrzy.mongodb.net/?retryWrites=true&w=majority`;

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
        await client.connect();

        const userCollection = client.db('aircnc').collection('users')
        const roomCollection = client.db('aircnc').collection('rooms')
        const bookingsCollection = client.db('aircnc').collection('bookings')


        //generate jwt token
        app.post('/jwt', (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h',
            })

            res.send({ token })
        })


        //save user to db
        app.put('/users/:email', async (req, res) => {
            const user = req.body
            const email = req.params.email;
            const query = { email: email }
            const options = { upsert: true }
            const updateDoc = {
                $set: user
            }
            const result = await userCollection.updateOne(query, updateDoc, options)
            res.send(result)

        })

        //get all users
        app.get('/users', async (req, res) => {
            const result = await userCollection.find().toArray()
            res.send(result)
        })

        //get user role;
        app.get('/users/role/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const user = await userCollection.findOne(filter)
            const result = user?.role
            res.send(result)
        })

        //update user role;
        app.patch('/users/:email', async (req, res) => {
            const email = req.params.email;
            const { data } = req.body;
            const query = { email: email }
            const updateDoc = {
                $set: {
                    role: data
                }
            }
            const result = await userCollection.updateOne(query, updateDoc)
            res.send(result)

        })


        //room related api
        app.get('/rooms', async (req, res) => {
            const result = await roomCollection.find().toArray()
            res.send(result)
        })
        app.get('/rooms/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const result = await roomCollection.findOne(filter)
            res.send(result)
        });

        //post rooms
        app.post('/rooms', verifyJWT, async (req, res) => {
            const room = req.body;
            const result = await roomCollection.insertOne(room)
            res.send(result)
        })

        //update a room;
        app.put('/rooms/:id', async (req, res) => {
            const id = req.params.id;
            const room = req.body;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: room
            };
            const options = { upsert: true };
            const result = await roomCollection.updateOne(filter, updateDoc, options)
            res.send(result)

        })


        //update status for room;
        app.patch('/rooms/status/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const status = req.body.status;
            console.log('status', status)
            const updateDoc = {
                $set: {
                    booked: status
                }
            };

            const result = await roomCollection.updateOne(filter, updateDoc)
            res.send(result)

        })

        //get host rooms
        app.get('/rooms/host/:email', async (req, res) => {
            const email = req.params.email;
            const query = { 'host.email': email }
            const result = await roomCollection.find(query).toArray()
            res.send(result)
        });


        //delete host room
        app.delete('/rooms/host/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await roomCollection.deleteOne(filter)
            res.send(result)
        });

        //get guest room
        app.get('/rooms/guest/:email', async (req, res) => {
            const email = req.params.email;

            const query = { 'host.email': email }
            const result = await roomCollection.find(query).toArray()
     
            res.send(result)
        });



        //get bookings for guest;
        app.get('/bookings/guest/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { 'guest.email': email }
            const result = await bookingsCollection.find(query).toArray()
            res.send(result)
        });

        //get bookings for host;
        app.get('/bookings/host/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { host: email }
            const result = await bookingsCollection.find(query).toArray()

            res.send(result)
        })


        //save bookings to database
        app.post('/bookings', verifyJWT, async (req, res) => {
            const booking = req.body
            const result = await bookingsCollection.insertOne(booking)
            if (result.insertedId) {
            // Send confirmation email to guest
            sendMail(
                {
                    subject: 'Booking Successful!',
                    message: `Booking Id: ${result?.insertedId}, TransactionId: ${booking.transactionId}`,
                },
                booking?.guest?.email
            )
            // Send confirmation email to host
            sendMail(
                {
                    subject: 'Your room got booked!',
                    message: `Booking Id: ${result?.insertedId}, TransactionId: ${booking.transactionId}. Check dashboard for more info`,
                },
                booking?.host
            )
            }
            res.send(result)
        })


        //delete a booking
        app.delete('/bookings/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await bookingsCollection.deleteOne(filter)
            res.send(result)
        })

        // create payment intent
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body
            const amount = parseFloat(price) * 100
            if (!price) return
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card'],
            })

            res.send({
                clientSecret: paymentIntent.client_secret,
            })
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('AirCNC Server is running..')
})

app.listen(port, () => {
    console.log(`AirCNC is running on port ${port}`)
})