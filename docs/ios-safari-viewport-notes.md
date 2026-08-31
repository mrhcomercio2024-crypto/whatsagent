# Referências — Safari iOS, teclado e viewport

Consulta técnica realizada em 31 de agosto de 2026 para a correção conservadora do Ravi Web.

1. MDN, **VisualViewport**: https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
2. MDN, **Visual Viewport API**: https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API
3. WebKit, **Designing Websites for iPhone X**: https://webkit.org/blog/7929/designing-websites-for-iphone-x/
4. WebKit Bugzilla, **Visual viewport inconsistencies with the software keyboard**: https://bugs.webkit.org/show_bug.cgi?id=292603
5. Martijn Hols, **Prevent iOS Safari from scrolling the page when focusing inputs**: https://gist.github.com/MartijnHols/e9f4f787efa9190885a708468f63c5bb

## Decisão aplicada

O Ravi Web não deve redimensionar o shell por JavaScript, não deve usar `visualViewport`, `window.innerHeight`, variáveis `--vh`, `position: fixed` ou bloqueio de scroll do `body`. A rota pública deve funcionar como uma página normal: `min-height: 100svh`, cabeçalho e compositor `sticky`, mensagens no fluxo e textarea de 16px.
