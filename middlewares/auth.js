module.exports = (req, res, next) => {
  // 게이트웨이가 x-user-id를 가져옴
  const userId = req.headers['x-user-id'];
  
  // 오류 response
  if (!userId) {
    return res.status(401).json({ 
      success: false, 
      error_code: "UNAUTHORIZED", 
      message: "인증 정보(User ID)가 누락되었습니다. 게이트웨이를 확인하세요." 
    });
  }
  
  // 성공 시 넘어가기 
  next();
};