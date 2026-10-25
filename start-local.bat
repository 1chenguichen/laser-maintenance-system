@echo off
chcp 65001 >nul
setlocal

REM ==========================================================
REM  端口配置（按需修改）
REM ==========================================================
set PORT_BACKEND=8080
set PORT_CSADMIN=3000
set PORT_CUSTOMER=3001
set PORT_ENGINEER=3002
set ROOT=%~dp0

echo ========================================
echo 激光设备售后维修系统 - 本地启动
echo ========================================
echo.

REM ------------------------------------------------------------
REM [0/5] 环境准备
REM ------------------------------------------------------------
echo [0/5] 检查后端环境配置...
if not exist "%ROOT%backend\.env" (
  echo   未找到 backend\.env，正在从 .env.example 复制...
  copy "%ROOT%backend\.env.example" "%ROOT%backend\.env" >nul
  echo   已生成 backend\.env
)
if not exist "%ROOT%backend\node_modules" (
  echo   未找到依赖，正在安装 backend 依赖...
  cd /d "%ROOT%backend"
  call npm install
  cd /d "%ROOT%"
)

REM ------------------------------------------------------------
REM [1/5] Docker 容器 (PostgreSQL + Redis)
REM ------------------------------------------------------------
echo [1/5] 启动 Docker 容器 (PostgreSQL + Redis)...
cd /d "%ROOT%backend"
docker-compose up -d
cd /d "%ROOT%"

REM 等待数据库就绪
echo   等待数据库就绪...
timeout /t 8 /nobreak >nul

REM ------------------------------------------------------------
REM [2/5] 后端服务
REM ------------------------------------------------------------
echo [2/5] 启动后端服务 (port %PORT_BACKEND%)...
cd /d "%ROOT%backend"
start "Backend" cmd /k "set PORT=%PORT_BACKEND% && npm run start:dev"
cd /d "%ROOT%"
timeout /t 6 /nobreak >nul

REM ------------------------------------------------------------
REM [3/5] 种子数据
REM ------------------------------------------------------------
echo [3/5] 导入演示数据...
cd /d "%ROOT%backend"
call npm run db:seed
cd /d "%ROOT%"

REM ------------------------------------------------------------
REM [4/5] 客服后台
REM ------------------------------------------------------------
echo [4/5] 启动客服后台 (port %PORT_CSADMIN%)...
cd /d "%ROOT%apps\cs-admin"
if not exist "node_modules" (
  echo   正在安装客服后台依赖...
  call npm install
)
start "CS-Admin" cmd /k "set BROWSER=none && set PORT=%PORT_CSADMIN% && npm start"
cd /d "%ROOT%"

REM ------------------------------------------------------------
REM [5/5] Web 端 (静态托管)
REM ------------------------------------------------------------
echo [5/5] 启动 Web 端...
cd /d "%ROOT%apps\customer-app-web"
start "Customer-Web" cmd /k "npx --yes serve -l %PORT_CUSTOMER% ."
cd /d "%ROOT%apps\engineer-app-web"
start "Engineer-Web" cmd /k "npx --yes serve -l %PORT_ENGINEER% ."
cd /d "%ROOT%"

echo.
echo ========================================
echo 启动完成！
echo ========================================
echo.
echo   后端 API     http://localhost:%PORT_BACKEND%
echo   客服后台     http://localhost:%PORT_CSADMIN%
echo   客户App Web  http://localhost:%PORT_CUSTOMER%/login.html
echo   工程师App Web http://localhost:%PORT_ENGINEER%/login.html
echo.
echo   测试登录 (验证码固定 000000):
echo     客服后台 / 客户  13800138000
echo     工程师        13900000002
echo.
echo   停止服务请运行 stop-local.bat
echo.
pause
