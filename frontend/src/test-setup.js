import '@testing-library/jest-dom'

// jsdom não implementa scrollIntoView — componentes que o chamam (ex: AgentChat
// rolando pro fim do histórico) quebram o efeito inteiro sem esse stub.
Element.prototype.scrollIntoView ??= () => {}
