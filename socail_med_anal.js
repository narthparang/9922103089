const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3000;
const TEST_SERVER_BASE_URL = 'http://20.244.56.144/evaluation-service';


const AUTH_DETAILS = {
  "email": "narthparang@gmail.com",
  "name": "parth narang",
  "rollNo": "9922103089",
  "accessCode": "SrMQqR",
  "clientID": "26172ff6-f639-423e-bf79-9690e89f8dea",
  "clientSecret": "uSzCvshkhEEZFjAb"
};


let userPostCountCache = new Map();
let popularPostsCache = null;
let latestPostsCache = null;
let commentsCache = new Map(); 
let lastCacheUpdateTime = 0;
const CACHE_TTL = 60 * 1000; 


let authToken = '';
let tokenExpiresAt = 0;


setInterval(() => {
  userPostCountCache.clear();
  popularPostsCache = null;
  latestPostsCache = null;
  commentsCache.clear(); 
  console.log('Cache cleared');
}, CACHE_TTL);


const getAuthToken = async () => {
  try {
    const currentTime = Math.floor(Date.now() / 1000);
    if (authToken && tokenExpiresAt > currentTime) {
      return authToken;
    }

    const response = await axios.post(`${TEST_SERVER_BASE_URL}/auth`, AUTH_DETAILS);
    const { access_token, expires_in } = response.data;
    
    authToken = access_token;
    tokenExpiresAt = Math.floor(Date.now() / 1000) + expires_in;
    
    console.log('New authentication token acquired');
    return authToken;
  } catch (error) {
    console.error('Error getting authentication token:', error.message);
    throw new Error('Failed to authenticate with the service');
  }
};


async function getAllUsers() {
  try {
    const token = await getAuthToken();
    const response = await axios.get(`${TEST_SERVER_BASE_URL}/users`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data.users || {};
  } catch (error) {
    console.error('Error fetching users:', error.message);
    throw new Error('Failed to fetch users from the test server');
  }
}


async function countUserPosts() {
  
  if (userPostCountCache.size > 0 && Date.now() - lastCacheUpdateTime < CACHE_TTL) {
    return Array.from(userPostCountCache.entries())
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count);
  }

  try {
    const users = await getAllUsers();
    const userIds = Object.keys(users);
    const token = await getAuthToken();
    
    // Clear existing cache
    userPostCountCache.clear();
    
    
    const countPromises = userIds.map(async (userId) => {
      try {
        const response = await axios.get(`${TEST_SERVER_BASE_URL}/users/${userId}/posts`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const postCount = response.data.posts?.length || 0;
        userPostCountCache.set(userId, postCount);
        return { userId, count: postCount };
      } catch (error) {
        console.error(`Error fetching posts for user ${userId}:`, error.message);
        userPostCountCache.set(userId, 0);
        return { userId, count: 0 };
      }
    });
    
    const results = await Promise.all(countPromises);
    lastCacheUpdateTime = Date.now();
    
   
    return results.sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('Error counting user posts:', error.message);
    throw new Error('Failed to count user posts');
  }
}


async function getComments(postId) {
  // Check cache first
  const cacheKey = `comments-${postId}`;
  if (commentsCache.has(cacheKey) && Date.now() - lastCacheUpdateTime < CACHE_TTL) {
    return commentsCache.get(cacheKey);
  }

  try {
    const token = await getAuthToken();
    const response = await axios.get(`${TEST_SERVER_BASE_URL}/posts/${postId}/comments`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const comments = response.data.comments || [];
    commentsCache.set(cacheKey, comments);
    return comments;
  } catch (error) {
    console.error(`Error fetching comments for post ${postId}:`, error.message);
    throw error;
  }
}


async function getPostsWithCommentCounts(type) {
  
  if (type === 'popular' && popularPostsCache && Date.now() - lastCacheUpdateTime < CACHE_TTL) {
    return popularPostsCache;
  }
  
  if (type === 'latest' && latestPostsCache && Date.now() - lastCacheUpdateTime < CACHE_TTL) {
    return latestPostsCache;
  }

  try {
    const users = await getAllUsers();
    const userIds = Object.keys(users);
    const token = await getAuthToken();
    let allPosts = [];
    
    
    for (const userId of userIds) {
      try {
        const response = await axios.get(`${TEST_SERVER_BASE_URL}/users/${userId}/posts`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const userPosts = response.data.posts || [];
        allPosts = [...allPosts, ...userPosts];
      } catch (error) {
        console.error(`Error fetching posts for user ${userId}:`, error.message);
      }
    }
    
  
    const postsWithComments = await Promise.all(
      allPosts.map(async (post) => {
        try {
        
          const comments = await getComments(post.id);
          const commentCount = comments.length;
          return { ...post, commentCount, username: users[post.userId] || 'Unknown User' };
        } catch (error) {
          console.error(`Error fetching comments for post ${post.id}:`, error.message);
          return { ...post, commentCount: 0, username: users[post.userId] || 'Unknown User' };
        }
      })
    );
    
    if (type === 'popular') {
     
      popularPostsCache = postsWithComments.sort((a, b) => b.commentCount - a.commentCount);
      lastCacheUpdateTime = Date.now();
      return popularPostsCache;
    } else if (type === 'latest') {
     
      latestPostsCache = postsWithComments.sort((a, b) => b.id - a.id).slice(0, 5);
      lastCacheUpdateTime = Date.now();
      return latestPostsCache;
    }
    
    return [];
  } catch (error) {
    console.error('Error getting posts with comment counts:', error.message);
    throw new Error('Failed to get posts with comment counts');
  }
}


async function getUserPosts(userId) {
    try {
      
      if (!userId) {
        throw new Error('User ID is required');
      }
  
      const token = await getAuthToken();
      const response = await axios.get(`${TEST_SERVER_BASE_URL}/users/${userId}/posts`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const simplifiedPosts = (response.data.posts || []).map(post => ({
        userId: post.userId,
        postId: post.id,
        content: post.content
      }));
      
      return simplifiedPosts;
    } catch (error) {
      console.error(`Error fetching posts for user ${userId}:`, error.message);
      throw error;
    }
  }
  

  app.get('/api/users/:userId/posts', async (req, res) => {
    try {
      const userId = req.params.userId;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      const posts = await getUserPosts(userId);
      res.json({ posts });
    } catch (error) {
      console.error(`Error in /api/users/${req.params.userId}/posts/simplified:`, error.message);
      
      // Check if it's a specific error code from the test server
      if (error.response && error.response.status) {
        return res.status(error.response.status).json({ 
          error: `Error from test server: ${error.response.status}`,
          message: error.message
        });
      }
      
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });
  
app.get('/api/users', async (req, res) => {
    try {
      const users = await getAllUsers();
      
      
      const usersArray = Object.entries(users).map(([userId, username]) => ({
        userId,
        username
      }));
      
      res.json({ users: usersArray });
    } catch (error) {
      console.error('Error in /api/users:', error.message);
      
      // Check if it's a specific error code from the test server
      if (error.response && error.response.status) {
        return res.status(error.response.status).json({ 
          error: `Error from test server: ${error.response.status}`,
          message: error.message
        });
      }
      
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });
  
  

app.get('/api/top-users', async (req, res) => {
  try {
    const users = await getAllUsers();
    const userPostCounts = await countUserPosts();
    
    // Get top 5 users
    const topUsers = userPostCounts.slice(0, 5).map(item => ({
      userId: item.userId,
      username: users[item.userId] || 'Unknown User',
      postCount: item.count
    }));
    
    res.json({ topUsers });
  } catch (error) {
    console.error('Error in /api/top-users:', error.message);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.get('/api/posts', async (req, res) => {
  try {
    const type = req.query.type || 'popular';
    
    if (!['popular', 'latest'].includes(type)) {
      return res.status(400).json({ error: 'Invalid post type. Use "popular" or "latest".' });
    }
    
    const posts = await getPostsWithCommentCounts(type);
    
    if (type === 'popular') {
      res.json({ popularPosts: posts });
    } else {
      res.json({ latestPosts: posts.slice(0, 5) });
    }
  } catch (error) {
    console.error('Error in /api/posts:', error.message);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});


app.get('/api/comments/:postId', async (req, res) => {
  try {
    const postId = req.params.postId;
    
    if (!postId) {
      return res.status(400).json({ error: 'Post ID is required' });
    }
    
    const comments = await getComments(postId);
    res.json({ comments });
  } catch (error) {
    console.error(`Error in /api/comments/${req.params.postId}:`, error.message);
    
    // Check if it's a specific error code from the test server
    if (error.response && error.response.status) {
      return res.status(error.response.status).json({ 
        error: `Error from test server: ${error.response.status}`,
        message: error.message
      });
    }
    
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({
    service: 'Social Media Analytics Microservice',
    version: '1.0.0',
    endpoints: [
      {
        path: '/api/users',
        method: 'GET',
        description: 'Returns a list of all users in the system'
      },
      {
        path: '/api/top-users',
        method: 'GET',
        description: 'Returns the top 5 users with the highest post count'
      },
      {
        path: '/api/posts',
        method: 'GET',
        params: {
          type: 'string (popular or latest)'
        },
        description: 'Returns posts sorted by popularity (comment count) or latest posts'
      },
      {
        path: '/api/comments/:postId',
        method: 'GET',
        params: {
          postId: 'string (required)'
        },
        description: 'Returns comments for a specific post'
      },
      {
        path: '/api/users/:userId/posts',
        method: 'GET',
        params: {
          userId: 'string (required)'
        },
        description: 'Returns simplified posts (userId, postId, content) for a specific user'
      },
      {
        path: '/health',
        method: 'GET',
        description: 'Health check endpoint'
      }
    ],
    note: 'All data is cached for 60 seconds to minimize API calls to the test server'
  });
});


app.listen(PORT, () => {
  console.log(`Social Media Analytics Microservice running on port ${PORT}`);
});