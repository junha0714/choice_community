import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backend = (process.env.BACKEND_URL || "").trim();
    // 프로덕션: 실제 API 주소를 BACKEND_URL로만 지정 (비어 있으면 리라이트 없음)
    if (process.env.NODE_ENV === "production" && !backend) {
      return [];
    }
    // 개발: BACKEND_URL 없으면 로컬 FastAPI 기본 포트로 프록시 (브라우저→/api 동일 출처, CORS 회피)
    const target = backend || "http://127.0.0.1:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${target.replace(/\/$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;
