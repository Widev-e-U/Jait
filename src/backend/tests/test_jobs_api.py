"""
Integration tests for the Jobs API endpoints
"""
import pytest
from httpx import AsyncClient


class TestListJobs:
    """Tests for GET /jobs endpoint."""
    
    async def test_list_jobs_empty(self, client: AsyncClient, auth_headers: dict):
        """Should return empty list when no jobs exist."""
        response = await client.get("/jobs", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["page"] == 1
    
    async def test_list_jobs_unauthorized(self, client: AsyncClient):
        """Should return 401 when not authenticated."""
        response = await client.get("/jobs")
        assert response.status_code == 401
    
    async def test_list_jobs_with_data(
        self, client: AsyncClient, auth_headers: dict, sample_job_data: dict, mock_temporal: dict
    ):
        """Should return list of jobs after creation."""
        # Create a job first
        create_response = await client.post("/jobs", json=sample_job_data, headers=auth_headers)
        assert create_response.status_code == 201
        
        # List jobs
        response = await client.get("/jobs", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["name"] == sample_job_data["name"]
    
    async def test_list_jobs_pagination(
        self, client: AsyncClient, auth_headers: dict, sample_job_data: dict, mock_temporal: dict
    ):
        """Should paginate results correctly."""
        # Create multiple jobs
        for i in range(5):
            job_data = {**sample_job_data, "name": f"Job {i}"}
            await client.post("/jobs", json=job_data, headers=auth_headers)
        
        # Get first page
        response = await client.get("/jobs?page=1&size=2", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        assert data["page"] == 1
        assert data["size"] == 2
        
        # Get second page
        response = await client.get("/jobs?page=2&size=2", headers=auth_headers)
        data = response.json()
        assert len(data["items"]) == 2
        assert data["page"] == 2


class TestCreateJob:
    """Tests for POST /jobs endpoint."""
    
    async def test_create_agent_task(
        self, client: AsyncClient, auth_headers: dict, sample_job_data: dict, mock_temporal: dict
    ):
        """Should create an agent task job successfully."""
        response = await client.post("/jobs", json=sample_job_data, headers=auth_headers)
        assert response.status_code == 201
        data = response.json()
        
        assert data["name"] == sample_job_data["name"]
        assert data["description"] == sample_job_data["description"]
        assert data["cron_expression"] == sample_job_data["cron_expression"]
        assert data["job_type"] == sample_job_data["job_type"]
        assert data["prompt"] == sample_job_data["prompt"]
        assert data["provider"] == sample_job_data["provider"]
        assert data["model"] == sample_job_data["model"]
        assert data["enabled"] is True
        assert data["id"] is not None
        assert data["temporal_schedule_id"] is not None
        
        # Verify Temporal was called
        mock_temporal["create_schedule"].assert_called_once()
    
    async def test_create_job_invalid_cron(
        self, client: AsyncClient, auth_headers: dict, sample_job_data: dict
    ):
        """Should reject invalid cron expression."""
        sample_job_data["cron_expression"] = "invalid cron"
        response = await client.post("/jobs", json=sample_job_data, headers=auth_headers)
        assert response.status_code == 400
        assert "Invalid cron expression" in response.json()["detail"]
    
    async def test_create_agent_task_missing_prompt(
        self, client: AsyncClient, auth_headers: dict, sample_job_data: dict
    ):
        """Should reject agent_task without prompt."""
        del sample_job_data["prompt"]
        response = await client.post("/jobs", json=sample_job_data, headers=auth_headers)
        assert response.status_code == 400
        assert "Prompt is required" in response.json()["detail"]
    
    async def test_create_job_unauthorized(
        self, client: AsyncClient, sample_job_data: dict
    ):
        """Should return 401 when not authenticated."""
        response = await client.post("/jobs", json=sample_job_data)
        assert response.status_code == 401


class TestGetJob:
    """Tests for GET /jobs/{job_id} endpoint."""
    
    async def test_get_job(
        self, client: AsyncClient, auth_headers: dict, sample_job_data: dict, mock_temporal: dict
    ):
        """Should get a specific job by ID."""
        # Create job
        create_response = await client.post("/jobs", json=sample_job_data, headers=auth_headers)
        job_id = create_response.json()["id"]
        
        # Get job
        response = await client.get(f"/jobs/{job_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == job_id
        assert data["name"] == sample_job_data["name"]
    
    async def test_get_job_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Should return 404 for non-existent job."""
        response = await client.get("/jobs/non-existent-id", headers=auth_headers)
        assert response.status_code == 404
    
    async def test_get_job_unauthorized(self, client: AsyncClient):
        """Should return 401 when not authenticated."""
        response = await client.get("/jobs/some-id")
        assert response.status_code == 401


class TestUpdateJob:
    """Tests for PATCH /jobs/{job_id} endpoint."""
    
    async def test_update_job_name(
        self, client: AsyncClient, auth_headers: dict, sample_job_data: dict, mock_temporal: dict
    ):
        """Should update job name."""
        # Create job
        create_response = await client.post("/jobs", json=sample_job_data, headers=auth_headers)
        job_id = create_response.json()["id"]
        
        # Update job
        response = await client.patch(
            f"/jobs/{job_id}",
            json={"name": "Updated Name"},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Name"
    
    async def test_update_job_cron(
        self, client: AsyncClient, auth_headers: dict, sample_job_data: dict, mock_temporal: dict
    ):
        """Should update cron expression and recreate Temporal schedule."""
        # Create job
        create_response = await client.post("/jobs", json=sample_job_data, headers=auth_headers)
        job_id = create_response.json()["id"]
        
        # Update cron
        response = await client.patch(
            f"/jobs/{job_id}",
            json={"cron_expression": "*/5 * * * *"},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["cron_expression"] == "*/5 * * * *"
        
        # Verify Temporal schedule was recreated
        assert mock_temporal["delete_schedule"].called
        assert mock_temporal["create_schedule"].call_count == 2
    
    async def test_update_job_disable(
        self, client: AsyncClient, auth_headers: dict, sample_job_data: dict, mock_temporal: dict
    ):
        """Should disable job and pause Temporal schedule."""
        # Create job
        create_response = await client.post("/jobs", json=sample_job_data, headers=auth_headers)
        job_id = create_response.json()["id"]
        
        # Disable
        response = await client.patch(
            f"/jobs/{job_id}",
            json={"enabled": False},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["enabled"] is False
        mock_temporal["pause_schedule"].assert_called()
    
    async def test_update_job_enable(
        self, client: AsyncClient, auth_headers: dict, sample_job_data: dict, mock_temporal: dict
    ):
        """Should enable job and unpause Temporal schedule."""
        # Create disabled job
        sample_job_data["enabled"] = False
        create_response = await client.post("/jobs", json=sample_job_data, headers=auth_headers)
        job_id = create_response.json()["id"]
        
        # Enable
        response = await client.patch(
            f"/jobs/{job_id}",
            json={"enabled": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["enabled"] is True
        mock_temporal["unpause_schedule"].assert_called()
    
    async def test_update_job_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Should return 404 for non-existent job."""
        response = await client.patch(
            "/jobs/non-existent-id",
            json={"name": "New Name"},
            headers=auth_headers
        )
        assert response.status_code == 404
    
    async def test_update_job_invalid_cron(
        self, client: AsyncClient, auth_headers: dict, sample_job_data: dict, mock_temporal: dict
    ):
        """Should reject invalid cron expression in update."""
        # Create job
        create_response = await client.post("/jobs", json=sample_job_data, headers=auth_headers)
        job_id = create_response.json()["id"]
        
        # Update with invalid cron
        response = await client.patch(
            f"/jobs/{job_id}",
            json={"cron_expression": "bad cron"},
            headers=auth_headers
        )
        assert response.status_code == 400


class TestDeleteJob:
    """Tests for DELETE /jobs/{job_id} endpoint."""
    
    async def test_delete_job(
        self, client: AsyncClient, auth_headers: dict, sample_job_data: dict, mock_temporal: dict
    ):
        """Should delete job successfully."""
        # Create job
        create_response = await client.post("/jobs", json=sample_job_data, headers=auth_headers)
        job_id = create_response.json()["id"]
        
        # Delete job
        response = await client.delete(f"/jobs/{job_id}", headers=auth_headers)
        assert response.status_code == 204
        
        # Verify it's gone
        get_response = await client.get(f"/jobs/{job_id}", headers=auth_headers)
        assert get_response.status_code == 404
        
        # Verify Temporal schedule was deleted
        mock_temporal["delete_schedule"].assert_called()
    
    async def test_delete_job_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Should return 404 for non-existent job."""
        response = await client.delete("/jobs/non-existent-id", headers=auth_headers)
        assert response.status_code == 404


class TestTriggerJob:
    """Tests for POST /jobs/{job_id}/trigger endpoint."""
    
    async def test_trigger_job(
        self, client: AsyncClient, auth_headers: dict, sample_job_data: dict, mock_temporal: dict
    ):
        """Should trigger job execution."""
        # Create job
        create_response = await client.post("/jobs", json=sample_job_data, headers=auth_headers)
        job_id = create_response.json()["id"]
        
        # Trigger job
        response = await client.post(f"/jobs/{job_id}/trigger", headers=auth_headers)
        assert response.status_code == 202
        assert response.json()["status"] == "triggered"
        assert response.json()["job_id"] == job_id
        
        # Verify Temporal was called
        mock_temporal["trigger_schedule"].assert_called()
    
    async def test_trigger_job_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Should return 404 for non-existent job."""
        response = await client.post("/jobs/non-existent-id/trigger", headers=auth_headers)
        assert response.status_code == 404


class TestGetJobRuns:
    """Tests for GET /jobs/{job_id}/runs endpoint."""
    
    async def test_get_job_runs_empty(
        self, client: AsyncClient, auth_headers: dict, sample_job_data: dict, mock_temporal: dict
    ):
        """Should return empty list when no runs exist."""
        # Create job
        create_response = await client.post("/jobs", json=sample_job_data, headers=auth_headers)
        job_id = create_response.json()["id"]
        
        # Get runs
        response = await client.get(f"/jobs/{job_id}/runs", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0
    
    async def test_get_job_runs_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Should return 404 for non-existent job."""
        response = await client.get("/jobs/non-existent-id/runs", headers=auth_headers)
        assert response.status_code == 404


class TestGetAvailableProviders:
    """Tests for GET /jobs/providers/available endpoint."""
    
    async def test_get_providers(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Should return list of available providers."""
        response = await client.get("/jobs/providers/available", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "providers" in data
        # Should have at least ollama provider
        assert isinstance(data["providers"], dict)
    
    async def test_get_providers_unauthorized(self, client: AsyncClient):
        """Should return 401 when not authenticated."""
        response = await client.get("/jobs/providers/available")
        assert response.status_code == 401
