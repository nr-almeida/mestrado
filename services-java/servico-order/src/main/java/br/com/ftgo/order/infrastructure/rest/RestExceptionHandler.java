package br.com.ftgo.order.infrastructure.rest;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import br.com.ftgo.order.application.OrderNotFoundException;
import br.com.ftgo.order.domain.InvalidOrderStateTransitionException;

/**
 * Mapeia as exceções de domínio e de aplicação para códigos HTTP,
 * mantendo a mesma semântica da implementação Node:
 * 404 (pedido inexistente), 409 (transição de estado inválida),
 * 400 (validação / argumento inválido).
 */
@RestControllerAdvice
public class RestExceptionHandler {

    @ExceptionHandler(OrderNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(OrderNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InvalidOrderStateTransitionException.class)
    public ResponseEntity<Map<String, String>> handleInvalidTransition(InvalidOrderStateTransitionException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler({IllegalArgumentException.class, IllegalStateException.class})
    public ResponseEntity<Map<String, String>> handleBadRequest(RuntimeException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException ex) {
        String msg = ex.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .orElse("Requisição inválida.");
        return ResponseEntity.badRequest().body(Map.of("error", msg));
    }
}
