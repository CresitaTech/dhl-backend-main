const axios = require('axios');
const SubscriptionPlan  = require("../models/subscriptionPlanModel");
const {User} = require("../models/userModel");
const Payment = require("../models/paymentModel");
const SubscriptionDetails = require("../models/subscriptionDetailsModel");
const { razorpayInstance } = require("../utils/razorpay");
const crypto = require('crypto');


exports.addPlan = async(req,res) =>{
    try {
        const{ name,plan_id,trialDays,have_trial,maxGroup,maxMember,pricePerMonth } = req.body;

        const subscription = new SubscriptionPlan({
            name,
            plan_id,
            trialDays,
            have_trial,
            maxGroup,
            maxMember,
            pricePerMonth
        });

        const plan = await subscription.save();
        console.log("Plan details:",plan);
        return res.status(200).json({
            message:'successfully added the plans',
            data:plan
        })
        
    } catch (error) {
        console.log("failed to add the plans",error);
        return res.status(500).json({message:'failed to add the plans in database',error});
    }
}

exports.getAllPlans = async(req,res) =>{
    try {
        const plans = await SubscriptionPlan.find();

        return res.status(200).json({
            success:true,
            data:plans
        })
    } catch (error) {
        console.log('failed to get the plans',error);
        return res.status(400).json(error.message);
    }
}


//creating subscription plan for user
exports.createSubscription = async (req, res) => {
    try {
      const user_id = req.user.userId;
      const { plan_id } = req.body;
  
      if(!user_id || !plan_id){
          return res.status(404).json({message:'user Id and Plan Id is required'});
      }
      const user = await User.findById(user_id);
      //  Create Razorpay Customer
      // const customer = await razorpayInstance.customers.create({
      //   email: customer_email,
      // });
  
      //  Createing Razorpay Subscription
      const subscription = await razorpayInstance.subscriptions.create({
        plan_id,                // Razorpay Plan ID
        total_count: 12,       // Billing cycle (e.g., 12 months)
        customer_notify: 1,
        start_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,    // Start after 30 days
      });
  
      user.subscription.id = subscription.id;
      user.subscription.status = subscription.status;
  
      await user.save();
      // Saving Subscription Details in DB
      const subscriptionDetails = new SubscriptionDetails({
        user_id: user_id,
        subscription_id: subscription.id,
        subscription_schedule_id: subscription.schedule_id || null,  
        planId:plan_id
      });
    //   console.log("Subcription Details:",subscriptionDetails);
      await subscriptionDetails.save();
      res.status(201).json({
        success: true,
        subscriptionDetails,
        message: "Subscription created successfully.",
      });
    } catch (error) {
      console.error("Error creating subscription:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create subscription."
        
      });
    }
};

// exports.paymentVerification = async(req,res) =>{
//     try {
//         const { razorpay_signature,razorpay_payment_id,razorpay_subscription_id } = req.body;

//         const user_Id = req.user.userId;
//         console.log("UserId:",user_Id);

//         const user = await User.findById(user_Id); 
//         const subscription_id = user.subscription.id;

//         const genereated_signature = crypto.createHmac(
//             "sha256",
//             process.env.RAZORPAY_KEY_SECRET
//         ).update(razorpay_payment_id+"|"+subscription_id,"utf-8").digest("hex");

//         const isAuthentic = genereated_signature === razorpay_signature;

//         if(!isAuthentic){
//             return res.status(404).json({message:'Payment failed'});
//         }

//         await Payment.create({
//             razorpay_signature,
//             razorpay_payment_id,
//             razorpay_subscription_id
//         });

//         user.subscription.status = 'active';
//         user.is_subscribed = true;

//         await user.save();

//         return res.status(200).json({message:`Payment success ${razorpay_payment_id}`});
//     } catch (error) {
//         console.log("failed to verify the payment",error);
//         return res.status(400).json({message:'failed to verify the payment',error});
//     }

// }



//api to get the razorpay key

// Endpoint to verify the payment
exports.paymentVerification = async (req, res) => {
    try {
        const user_Id = req.user.userId;
        const { razorpay_payment_id } = req.body;

        // console.log("User_Id",user_Id);
        if (!razorpay_payment_id) {
            return res.status(400).json({ message: "Payment ID is required" });
        }

        const user = await User.findById(user_Id);
        // console.log("User:",user);
        if(!user){
            return res.status(400).json({message:'User not found'});
        }
        // console.log("Received Payment ID:", razorpay_payment_id);

        const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
        const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
        const auth = `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64")}`;

        // Fetch payment details from Razorpay
        const response = await axios.get(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
            headers: { Authorization: auth }
        });

        const payment = response.data;
        console.log("Razorpay Payment Response:", payment);  

        // If payment is "authorized", capture it before verifying
        if (payment.status === "authorized") {
            console.log("Capturing payment...");

            const captureResponse = await axios.post(
                `https://api.razorpay.com/v1/payments/${razorpay_payment_id}/capture`,
                { amount: payment.amount, currency: payment.currency },
                { headers: { Authorization: auth } }
            );

            console.log("Capture Response:", captureResponse.data);
        }

        // Fetch updated payment details after capture
        const updatedPaymentResponse = await axios.get(
            `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
            { headers: { Authorization: auth } }
        );

        const updatedPayment = updatedPaymentResponse.data;
        console.log("Updated Payment Response:", updatedPayment);

        // Verify if the payment is now captured
        if (updatedPayment.status !== "captured") {
            return res.status(400).json({ 
                message: "Payment verification failed!",
                razorpay_status: updatedPayment.status 
            });
        }
        
        user.subscription.status = 'active';
        user.is_subscribed = true;

        // console.log("------",user);
        await user.save();

        return res.status(200).json({ 
            message: "Payment Verified successfully",
            payment_details: updatedPayment
        });

    } catch (error) {
        console.error("Payment verification failed:", error.response ? error.response.data : error.message);
        return res.status(500).json({ 
            message: "Failed to verify payment",
            error: error.response ? error.response.data : error.message
        });
    }
};



exports.getRazorPayKey = async(req,res) =>{
    res.status(200).json({
        success:true,
        key:process.env.RAZORPAY_KEY_ID
    })
}

//api to verify the subscription status of the user
exports.subscriptionStatus = async(req,res) =>{
    try {
        const user_id = req.user.userId;

        const subscriptionDetails = await SubscriptionDetails.findOne({user_id});

        if (!subscriptionDetails) {
            return res.status(404).json({ success: false, message: "Subscription not found" });
        }

        const subscription = await razorpayInstance.subscriptions.fetch(subscriptionDetails.subscription_id);

        res.status(200).json({ success: true, subscription });
    } catch (error) {
        console.error("Error fetching subscription status:", error);
        res.status(500).json({ success: false, error: "Failed to fetch subscription status." });
    }
}

exports.cancelSubscription = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);

        if (!user.subscription || !user.subscription.id) {
            return res.status(400).json({ 
                success: false, 
                message: "No active subscription found to cancel." 
            });
        }

        const subscriptionId = user.subscription.id;

        // Cancel the subscription using Razorpay instance
        await razorpayInstance.subscriptions.cancel(subscriptionId);

        // Remove subscription details from the user
        user.subscription.id = undefined;
        user.subscription.status = undefined;
        user.is_subscribed = false;

        await user.save();

        res.status(200).json({
            success: true,
            message: "Subscription cancelled successfully.",
        });
    } catch (error) {
        console.error("Error cancelling subscription:", error);
        res.status(500).json({ 
            success: false, 
            error: "Failed to cancel subscription." 
        });
    }
};
