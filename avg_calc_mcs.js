const express = require('express');
const axios = require('axios');

const app = express();
const PORT = 9876;
const TEST_SERVER_URL = 'http://20.244.56.144/evaluation-service';


const WINDOW_SIZE = 10;
const REQUEST_TIMEOUT = 500;

let authToken = '';
let tokenExpiresAt = 0;

//registration details
const AUTH_DETAILS = {
    "email": "narthparang@gmail.com",
    "name": "parth narang",
    "rollNo": "9922103089",
    "accessCode": "SrMQqR",
    "clientID": "26172ff6-f639-423e-bf79-9690e89f8dea",
    "clientSecret": "uSzCvshkhEEZFjAb"
  };
  


let numberStore = {
  windowPrevState: [],
  windowCurrState: [],
  numbers: []
};


const calculateAverage = (numbers) => {
  if (numbers.length === 0) return 0;
  const sum = numbers.reduce((acc, num) => acc + num, 0);
  return (sum / numbers.length).toFixed(2);
};

//auth token
const getAuthToken = async () => {
    try {
      
      const currentTime = Math.floor(Date.now() / 1000);
      if (authToken && tokenExpiresAt > currentTime) {
        return authToken;
      }
  
      const response = await axios.post(`${TEST_SERVER_URL}/auth`, AUTH_DETAILS);
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
  


  const fetchNumbers = async (type) => {
    try {
      
      const token = await getAuthToken();
      
      let endpoint;
      switch (type) {
        case 'p':
          endpoint = `${TEST_SERVER_URL}/primes`;
          break;
        case 'f':
          endpoint = `${TEST_SERVER_URL}/fibo`;
          break;
        case 'e':
          endpoint = `${TEST_SERVER_URL}/even`;
          break;
        case 'r':
          endpoint = `${TEST_SERVER_URL}/rand`;
          break;
        default:
          throw new Error('Invalid number type');
      }
  
      const response = await axios.get(endpoint, {
        timeout: REQUEST_TIMEOUT,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      return response.data.numbers;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.error(`Request to fetch ${type} numbers timed out`);
        return [];
      }
      console.error(`Error fetching numbers of type ${type}:`, error.message);
      return [];
    }
  };


const updateStore = (newNumbers) => {
  
  const uniqueNewNumbers = newNumbers.filter(num => !numberStore.numbers.includes(num));
  
 
  numberStore.numbers = [...numberStore.numbers, ...uniqueNewNumbers];
  

  if (numberStore.numbers.length > WINDOW_SIZE) {
   
    numberStore.windowPrevState = [...numberStore.windowCurrState];
    numberStore.windowCurrState = [...numberStore.numbers];
    
    
    numberStore.numbers = numberStore.numbers.slice(-WINDOW_SIZE);
  } else {

    numberStore.windowPrevState = [...numberStore.windowCurrState];
    numberStore.windowCurrState = [...numberStore.numbers];
  }
};

app.get('/', (req, res) => {
    res.json({
      message: "Average Calculator HTTP Microservice",
      usage: "Make GET requests to /numbers/{id}",
      supportedIds: {
        p: "Prime numbers",
        f: "Fibonacci numbers", 
        e: "Even numbers",
        r: "Random numbers"
      },
      examples: [
        "http://localhost:9876/numbers/p",
        "http://localhost:9876/numbers/e"
      ]
    });
  });

app.get('/numbers/:id', async (req, res) => {
  const id = req.params.id;
  
  if (!['p', 'f', 'e', 'r'].includes(id)) {
    return res.status(400).json({
      error: 'Invalid ID. Use p (prime), f (fibonacci), e (even), or r (random)'
    });
  }

  try {
    const fetchedNumbers = await fetchNumbers(id);
    
    updateStore(fetchedNumbers);
    
    const avg = calculateAverage(numberStore.numbers);
    
    const response = {
      windowPrevState: numberStore.windowPrevState,
      windowCurrState: numberStore.windowCurrState,
      numbers: numberStore.numbers,
      avg: parseFloat(avg)
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error processing request:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Average Calculator Microservice running on http://localhost:${PORT}`);
});