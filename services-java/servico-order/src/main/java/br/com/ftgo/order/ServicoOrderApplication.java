package br.com.ftgo.order;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Ponto de entrada do ServicoOrder — microsserviço Order Management
 * (core domain), implementação Java/Spring Boot do estudo de caso
 * ProMoBD/FTGO (Capítulo 5 da dissertação).
 */
@SpringBootApplication
public class ServicoOrderApplication {

    public static void main(String[] args) {
        SpringApplication.run(ServicoOrderApplication.class, args);
    }
}
