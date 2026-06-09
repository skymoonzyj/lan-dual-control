# GitHub 使用与同步流程

## 1. 推荐方式

用一个 GitHub 仓库作为项目中心。Windows 和 Mac mini 都克隆同一个仓库。

建议仓库名：

```text
lan-dual-control
```

## 2. 第一次上传

如果本地已经初始化 Git 仓库，拿到 GitHub 仓库地址后执行：

```powershell
git remote add origin https://github.com/你的用户名/lan-dual-control.git
git branch -M main
git push -u origin main
```

如果远端已经存在 origin：

```powershell
git remote set-url origin https://github.com/你的用户名/lan-dual-control.git
git push -u origin main
```

## 3. Windows 端开发流程

```powershell
git pull
git switch -c feature/windows-client
# 开发 Windows 端
git add .
git commit -m "Add Windows client prototype"
git push -u origin feature/windows-client
```

## 4. Mac 端开发流程

```bash
git pull
git switch -c feature/mac-host
# 开发 Mac 端
git add .
git commit -m "Add macOS host prototype"
git push -u origin feature/mac-host
```

## 5. 分支约定

- main：稳定文档和可运行版本。
- feature/mac-host：Mac 被控端和 Mac 控制端。
- feature/windows-client：Windows 控制端和 Windows 被控端。
- feature/protocol：共享协议改动。

## 6. 提交信息建议

使用简短英文提交信息，便于跨平台工具显示：

```text
Add product plan
Add protocol draft
Add macOS screen capture prototype
Add Windows client UI prototype
Update task board
```

## 7. 冲突处理原则

- 文档冲突时优先保留双方新增内容。
- 协议冲突必须人工确认，不能随意覆盖。
- Mac 端不要直接重写 Windows 端文件。
- Windows 端不要直接重写 Mac 端文件。
- 共享协议变更必须让两边都知道。

