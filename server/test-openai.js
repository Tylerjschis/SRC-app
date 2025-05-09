require('dotenv').config();
const { OpenAI } = require('openai');

// Initialize OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function testOpenAI() {
  console.log('API Key (first few chars):', process.env.OPENAI_API_KEY.substring(0, 10) + '...');
  
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say hello!" }
      ],
      max_tokens: 50
    });
    
    console.log('OpenAI API Test Successful!');
    console.log('Response:', completion.choices[0].message.content);
  } catch (error) {
    console.error('OpenAI API Test Failed!');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response Error:', error.response.data);
      console.error('Status:', error.response.status);
    }
  }
}

testOpenAI();