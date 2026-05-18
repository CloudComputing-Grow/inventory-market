require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//auth서비스 완성될 때까지 임시로 둠 
app.use((req, res, next) => {
  req.user = { user_id: 1 }; 
  next();
});

// 서버 정상 작동 확인
app.get('/', (req, res) => {
  res.send('인벤토리-마켓 서버 정상 가동 중!');
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`인벤토리-마켓 서버가 ${PORT}번 포트에서 가동 중입니다!`);
});