module.exports = (req, res, next) => {
  // 1. 헤더에서 정보 추출
  const userId = req.headers['x-user-id'];
  const userRole = req.headers['x-user-role'];
  const traceId = req.headers['x-trace-id'];

  // 2. userId 필수 확인 (인증 안 된 요청 차단)
  if (!userId) {
    return res.status(401).json({ 
      success: false, 
      error_code: "UNAUTHORIZED", 
      message: "인증 정보(User ID)가 누락되었습니다." 
    });
  }

  // 3. 로깅을 위해 req 객체에 저장 (다음 컨트롤러에서 쉽게 쓰기 위함)
  req.user = {
    id: userId,
    role: userRole || 'USER' // role이 없을 경우 기본값 USER
  };
  req.traceId = traceId;

  next();
};