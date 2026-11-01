Astra 星星粒子动效 — 非官方复刻(仅供学习研究)

这是什么
  openai.com/index/gpt-6-astra 首屏星星粒子动效的本地还原。
  跑的是原站真实代码(原 WebGL 粒子引擎/原交互/原滚动变形),已裁剪为:
  只保留顶部导航 + 首屏动效(散开 → 星系 6 → 光标 → OpenAI 花结)。
  文章正文/表格/视频/cookie 条已隐藏。

怎么跑
  1. 需要本机装有 Node.js 18+(越新越好)
  2. 双击「启动.bat」—— 会自动打开浏览器
     (手动地址:http://127.0.0.1:21418/index/gpt-6-astra/)
  3. 鼠标在页面上移动,粒子会跟随;向下滚动,依次变成 光标 → 花结

页面裁剪说明
  site/index/gpt-6-astra/index.html 相比原站多了两行:
    <meta name="robots" content="noindex, nofollow">  与  <style id="trim-style">
  其余字节与原站一致。mirror 证据基座不在本文件夹内。

残差(不影响使用)
  - 断网时:cookie/统计请求与视频区为空(已 stub,不会崩)
  - 控制台可能可见少量告警(Statsig/预取 404),无视觉影响

声明
  与 OpenAI 无任何关联;"OpenAI"、"GPT"、"Astra" 及相关标识、
  全部代码与美术资产的权利归属 OpenAI。仅供学习研究,不得公开部署或商用。
