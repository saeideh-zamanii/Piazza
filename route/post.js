const express = require("express");
const router = express.Router();
const Post = require("../model/post");
const Interaction = require("../model/interaction");
const verifyToken = require("../verifyToken");
const { postValidation } = require("../validations/validation");
const interactionCreator = require("../utility/interactionCreator");
const checkLive = require("../utility/checkLive");

const checkAndSetExpiry = async () => {
  try {
    const posts = await Post.find({});
    // return res.send(checkLive(posts));
    if (posts) {
      const ids = checkLive(posts);
      // return res.send(`ids: ${ids}`);
      ids.forEach(async (element) => {
        try {
          await Post.findByIdAndUpdate(element, { live: false }, { new: true });
        } catch (error) {
          return res.send(`ids: ${error}`);
        }
      });
    } else {
      return res.send("No posts in DB");
    }
  } catch (error) {
    return res.send(error);
  }
};

// Get all posts
router.get("/", verifyToken, async (req, res) => {
  checkAndSetExpiry();
  try {
    const posts = await Post.find({});
    if (posts) {
      return res.status(200).send(posts);
    }
    return res.send("No posts after update live");
  } catch (error) {
    return res.send(error);
  }
});

// Get a specific post by id
router.get("/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const post = await Post.findById(id);
    return res.status(200).json(post);
  } catch (error) {
    return res.send(error);
  }
});

// Get posts per topic
router.get("/topic/:topic", verifyToken, async (req, res) => {
  const topic = req.params.topic.toLowerCase();

  try {
    const post = await Post.find({ topic: topic });
    return res.status(200).send(post);
  } catch (error) {
    return res.send(error);
  }
});

// Get all expired posts per topic
router.get("/expired/:topic", verifyToken, async (req, res) => {
  checkAndSetExpiry();

  const { topic } = req.params;
  try {
    const posts = await Post.find({ topic: topic, live: false });
    return res.send(posts);
  } catch (error) {
    return res.send(error);
  }
});

// Get active post per topic
router.get("/highest-interest/:topic", verifyToken, async (req, res) => {
  checkAndSetExpiry();

  const { topic } = req.params;
  try {
    const post = await Post.find({ topic: topic }).sort({ likes: -1 }).limit(1);
    return res.send(post);
  } catch (error) {
    return res.send(error);
  }
});

// Add like, dislike, comment
router.put("/operations", verifyToken, async (req, res) => {
  checkAndSetExpiry();

  if (Object.keys(req.body).length === 0) return res.send("Nothing to update");
  const { _id, like, dislike, comment } = req.body;
  try {
    var post = await Post.findById(_id);
    if (!post) return res.status(404).send(`No user with id : ${req.post._id}`);
    if (post.ownerId === req.user._id)
      return res
        .status(403)
        .send(
          "You are the owner of this post and can not perform interactions"
        );
    if (!post.live)
      return res.send(
        "This post is not active anymore and can not accept any interactions"
      );
  } catch (error) {
    return res.send(error);
  }
  const updateData = {
    likes: post.likes,
    dislikes: post.dislike,
    comments: post.comments,
  };
  const interactionType = {
    like: false,
    dislike: false,
    comment: false,
  };

  // checks for like
  if (like === 1) {
    interactionType.like = true;
    if (comment) {
      updateData.likes = updateData.likes + 1;
      updateData.comments.push(comment);
      interactionType.comment = true;
    } else {
      updateData.likes = post.likes + like;
    }

    // checks for dislike
  } else if (dislike === 1) {
    interactionType.dislike = true;
    if (comment) {
      updateData.dislikes = post.dislikes + dislike;
      updateData.comments.push(comment);
      interactionType.comment = true;
    } else updateData.dislikes = post.dislikes + dislike;
  } else {
    updateData.comments.push(comment);
    interactionType.comment = true;
  }

  // Updates new changes to the post
  const updatedPost = await Post.findByIdAndUpdate(_id, updateData, {
    new: true,
  });

  // Creates Interaction record
  const interaction = interactionCreator(
    req.user._id,
    post._id,
    interactionType,
    post.expiry,
    post.timeStamp
  );
  try {
    await Interaction.create(interaction);
  } catch (error) {
    return res.send(error);
  }
  return res.send(updatedPost);
});

// Creates a new post
router.post("/", verifyToken, async (req, res) => {
  const formData = req.body;
  const currentDateTime = new Date();
  const postData = {
    title: formData.title,
    topic: formData.topic,
    timeStamp: currentDateTime.toString(),
    message: formData.message,
    ownerId: req.user._id,
    live: true,
    expiry: formData.expiry,
  };

  const { error } = postValidation(postData);
  if (error) {
    return res.send(error.message);
  }
  try {
    const newPost = await Post.create(postData);
    return res.send(newPost);
  } catch (error) {
    return res.send(error);
  }
});

// Updates a specific post
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const post = await Post.findByIdAndUpdate(id, req.body);
    if (!post) return res.status(404).send(`Could not find post with id ${id}`);
    return res.send(post);
  } catch (error) {
    return res.send(error);
  }
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await Post.findByIdAndDelete(id);
    const posts = await Post.find({});
    return res.send(posts);
  } catch (error) {
    return res.send(error);
  }
});

module.exports = router;
