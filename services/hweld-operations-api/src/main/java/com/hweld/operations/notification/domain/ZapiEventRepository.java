package com.hweld.operations.notification.domain;

import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ZapiEventRepository extends JpaRepository<ZapiEvent, UUID> {

    boolean existsByInstanceIdAndTipoAndZaapId(String instanceId, String tipo, String zaapId);

    List<ZapiEvent> findByOrderByRecebidoEmDesc(Pageable pageable);
}
