package br.com.ftgo.order.infrastructure.rest;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import br.com.ftgo.order.infrastructure.messaging.InMemoryEventPublisher;

/**
 * Testes de integração da API HTTP do ServicoOrder (camada web +
 * aplicação + domínio + adaptadores em memória), espelhando a suíte de
 * integração da implementação Node.
 */
@SpringBootTest
class OrderControllerTest {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private InMemoryEventPublisher eventPublisher;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        // O publisher é singleton do contexto Spring, compartilhado entre
        // os métodos de teste; limpamos para que cada teste comece do zero.
        eventPublisher.clear();
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
    }

    private MockMvc mvc() {
        return mvc;
    }

    private static final String VALID_ORDER = """
            {
              "consumerId": "consumer-1",
              "restaurantId": "restaurant-1",
              "items": [{"name": "Pizza Margherita", "quantity": 1, "unitPriceCents": 4500}],
              "deliveryAddress": {"street": "Rua das Flores, 123", "city": "São Paulo", "zip": "01000-000"}
            }
            """;

    private String createOrderAndGetId() throws Exception {
        MvcResult result = mvc().perform(post("/orders")
                        .contentType(MediaType.APPLICATION_JSON).content(VALID_ORDER))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.get("id").asText();
    }

    @Test
    void healthIsUp() throws Exception {
        mvc().perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status", is("UP")));
    }

    @Test
    void createsOrder201WithLocation() throws Exception {
        MvcResult result = mvc().perform(post("/orders")
                        .contentType(MediaType.APPLICATION_JSON).content(VALID_ORDER))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status", is("AGUARDANDO_ACEITACAO")))
                .andExpect(jsonPath("$.totalCents", is(4500)))
                .andReturn();
        String id = objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asText();
        mvc().perform(get("/orders/" + id)).andExpect(status().isOk());
    }

    @Test
    void rejectsInvalidPayload() throws Exception {
        mvc().perform(post("/orders")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"items\":[]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getUnknownReturns404() throws Exception {
        mvc().perform(get("/orders/nao-existe")).andExpect(status().isNotFound());
    }

    @Test
    void fullLifecycleReachesDelivered() throws Exception {
        String id = createOrderAndGetId();

        mvc().perform(post("/orders/" + id + "/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"CreditReserved\",\"payload\":{\"reservedAmountCents\":4500}}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status", is("PREPARANDO")));

        mvc().perform(post("/orders/" + id + "/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"TicketPrepared\"}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status", is("AGUARDANDO_ENTREGA")));

        mvc().perform(post("/orders/" + id + "/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"DeliveryScheduled\",\"payload\":{\"courierId\":\"entregador-42\"}}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.courierId", is("entregador-42")));

        mvc().perform(post("/orders/" + id + "/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"DeliveryCompleted\"}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status", is("ENTREGUE")));
    }

    @Test
    void creditRejectedCancelsOrder() throws Exception {
        String id = createOrderAndGetId();
        mvc().perform(post("/orders/" + id + "/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"CreditRejected\",\"payload\":{\"reason\":\"Limite insuficiente.\"}}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status", is("CANCELADO")))
                .andExpect(jsonPath("$.cancelReason", is("Limite insuficiente.")));
    }

    @Test
    void invalidTransitionReturns409() throws Exception {
        String id = createOrderAndGetId();
        // TicketPrepared antes de CreditReserved é inválido
        mvc().perform(post("/orders/" + id + "/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"TicketPrepared\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void unsupportedEventReturns400() throws Exception {
        String id = createOrderAndGetId();
        mvc().perform(post("/orders/" + id + "/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"EventoInexistente\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void directCancelWorks() throws Exception {
        String id = createOrderAndGetId();
        mvc().perform(post("/orders/" + id + "/cancel")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Consumidor desistiu.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status", is("CANCELADO")));
    }

    @Test
    void publishesEventsInOrderThroughLifecycle() throws Exception {
        String id = createOrderAndGetId();
        mvc().perform(post("/orders/" + id + "/events")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"CreditReserved\",\"payload\":{\"reservedAmountCents\":4500}}"));
        mvc().perform(post("/orders/" + id + "/events")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"TicketPrepared\"}"));
        mvc().perform(post("/orders/" + id + "/events")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"DeliveryScheduled\",\"payload\":{\"courierId\":\"entregador-42\"}}"));
        mvc().perform(post("/orders/" + id + "/events")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"DeliveryCompleted\"}"));

        // GET /events comprova a ordem OrderCreated -> OrderApproved -> OrderDelivered (EC-M4.3)
        mvc().perform(get("/events"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].type", is("OrderCreated")))
                .andExpect(jsonPath("$[1].type", is("OrderApproved")))
                .andExpect(jsonPath("$[2].type", is("OrderDelivered")));
    }
}
